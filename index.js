var os = require('os');
var fs = require('fs');
var async = require('async');
var path = require('path');
var md5 = require('MD5');

module.exports = function(options, done) {
    //TODO: validate options before creating database connections
    var validatedOptions = validateOptions(options);
    if (validatedOptions.errors.length > 0) return done(new Error(validatedOptions.errors.join(' and ')));
    var solidLine  = '----------------------------------------------------------------------';
    var brokenLine = '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ';
    var buildMethods = require('./buildMethods')(validatedOptions.options);
    var initMethods = require('./initMethods')(validatedOptions.options);
    var schemaScriptMethods = require('./schemaScriptMethods')(validatedOptions.options);
    var routinesMethods = require('./routinesMethods')(validatedOptions.options);




    async.series([
        validateDatabase,
        attemptLockForUpdate,
        processSchemaChanges,
        processStoredProcs
    ], function(err) {
        if (err) return done(err);
        console.log('                    Database updates complete');
        console.log('                   ---------------------------');
        initMethods.unlockLockTable(function(err) {
            if (err) return done(err);
            done();
        });
    });

    function validateDatabase(callback) {
        var actions = [
            buildMethods.checkIfDatabaseExists,
            buildMethods.createDatabase,
            buildMethods.checkIfLockTableExists,
            buildMethods.createDatabaseUpdateLockTable,
            buildMethods.checkIfScriptHistoryTableExists,
            buildMethods.createScriptHistory,
            buildMethods.checkIfProcHistoryTableExists,
            buildMethods.createProcHistory
        ];

        console.log(solidLine);
        console.log('| Validating database tables');
        console.log(brokenLine);

        async.waterfall(actions, function(err) {
            if (err) return callback(err);
            console.log('| Done');
            console.log(solidLine);
            callback();
        });
    }

    var lockCode = md5(Date.now().toString() + Math.random().toString());

    function attemptLockForUpdate(callback) {
        var localIp = getLocalIPAddress();
        async.waterfall([
            function(cb) {
                cb(null, lockCode, localIp);
            },
            initMethods.updateLockTableWithLockCode,
            initMethods.checkLockIsValid
        ], function(err, lockValid) {
            if (err) return callback(err);
            if (!lockValid) {
                initMethods.waitForUnlock(function(err) {
                    if (err) return next(err);
                    done();
                });
            } else {
                callback();
            }
        });
    }

    function processSchemaChanges(callback) {
        console.log(solidLine);
        console.log('| Checking for schema change scripts');
        console.log(brokenLine);

        schemaScriptMethods.getLastVersionNumber(function(err, lastVersion) {
            if (err) return callback(err);
            try {
                var scriptFileNames = fs.readdirSync(path.join(__dirname, options.schemaLocation));
            } catch (e) {
                return callback(new Error('unable_to_read_schema_directory'));
            }

            var scriptActions = [];
            scriptFileNames = orderFiles(scriptFileNames);
            scriptFileNames.forEach(function(scriptFileName) {
                var scriptVersion = getScriptVersion(scriptFileName);
                var scriptName = getScriptName(scriptFileName);
                if (scriptVersion > lastVersion) {
                    var scriptContent = getFileContent(scriptFileName, options.schemaLocation);
                    scriptActions = scriptActions.concat([
                        function(cb) {
                            var values = {scriptVersion: scriptVersion, scriptContent: scriptContent, name: scriptName};
                            cb(null, values);
                        },
                        schemaScriptMethods.insertAttemptIntoHistoryAsPending,
                        schemaScriptMethods.executeScript
                    ]);
                }
            });

            async.waterfall(scriptActions, function(err) {
                if (err) return callback(err);
                console.log('| Done');
                console.log(solidLine);
                callback();
            });
        });

    }

    function processStoredProcs(callback) {
        console.log(solidLine);
        console.log('| Checking for stored procedure updates');
        console.log(brokenLine);

        try {
            var routines = fs.readdirSync(path.join(__dirname, options.routinesLocation));
        } catch (e) {
            return callback(new Error('unable_to_read_procs_directory'));
        }

        var routineActions = [];

        routines.forEach(function (filename) {
            var content = getFileContent(filename, options.routinesLocation);
            var md5Hash = md5(content);
            var routineName = getRoutineName(content);
            var routineType = getRoutineType(content);
            if (!routineName) return;
            routineActions = routineActions.concat([
                function (cb) {
                    var values = {md5: md5Hash, name: routineName, content: content, routineType: routineType};
                    cb(null, values);
                },
                routinesMethods.getLatestMd5,
                routinesMethods.checkUpdateRequired,
                routinesMethods.getCurrentRoutineForRollback,
                routinesMethods.insertAttemptIntoHistoryAsPending,
                routinesMethods.dropCurrentRoutine,
                routinesMethods.createNewProcOrRollback,
                routinesMethods.recordUpdateHistory
            ]);
        });

        async.waterfall(routineActions, function (err) {
            if (err) return callback(err);
            console.log('| Done');
            console.log(solidLine);

            callback()
        });
    }

    function getFileContent(filename, folder) {
        return fs.readFileSync(path.join(__dirname, folder, filename), {encoding: 'utf8'});
    }

    function getRoutineName(content) {
        var routineNameRegex = /create (procedure)?(function)?\s?`?'?"?([a-z0-9]*)\(?\)?/i;
        var match = content.match(routineNameRegex);
        if (match && match.length > 0) return match[3].toLowerCase();
        return false;
    }

    function getRoutineType(content) {
        var routineTypeRegex = /create\s*([a-z]+)/i;
        var match = content.match(routineTypeRegex);
        if (match && match.length > 0) return match[1].toLowerCase();
        return false;
    }

    function validateOptions(options) {
        var errors = [];

        if (!options.schemaLocation) options.schemaLocation = 'schema';
        if (!options.routinesLocation) options.routinesLocation = 'routines';

        return {
            options: options,
            errors: errors
        };
    }

    function orderFiles(files) {
        return files.sort(function(a, b) {
            return a < b ? -1 : 1;
        });
    }

    function getScriptVersion(scriptFileName) {
        var match = scriptFileName.match(/^[0-9]+/);
        if (Array.isArray(match)) return parseInt(match[0]);
        return 0;
    }

    function getScriptName(scriptFileName) {
        var match = scriptFileName.match(/^[0-9]+_?-?([a-z_-]*)\.sql/i);
        var name = 'no_script_name';
        if (Array.isArray(match)) name = match[1];
        return name.substring(0, 99);
    }

    function getLocalIPAddress() {
        var interfaces = os.networkInterfaces();
        var addresses = [];
        for (var k in interfaces) {
            for (var k2 in interfaces[k]) {
                var address = interfaces[k][k2];
                if (address.family === 'IPv4' && !address.internal) {
                    addresses.push(address.address);
                }
            }
        }
        return addresses[0];
    }
};