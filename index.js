

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
    var schemaScriptMethods = require('./schemaScriptMethods')(validatedOptions.options);
    var storedProcedureMethods = require('./storedProcedureMethods')(validatedOptions.options);

    async.series([
        validateDatabase,
        processSchemaChanges,
        processStoredProcs
    ], function(err) {
        if (err) return done(err);
        console.log('                    Database updates complete');
        console.log('                   ---------------------------');
        done();
    });

    function validateDatabase(callback) {
        var actions = [
            buildMethods.checkIfDatabaseExists,
            buildMethods.createDatabase,
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

    function processSchemaChanges(callback) {
        console.log(solidLine);
        console.log('| Checking for schema change scripts');
        console.log(brokenLine);

        schemaScriptMethods.getLastVersionNumber(function(err, lastVersion) {
            if (err) return callback(err);
            try {
                var scriptFileNames = fs.readdirSync(path.join(__dirname, 'schema'));
            } catch (e) {
                return callback(new Error('unable_to_read_schema_directory'));
            }

            var scriptActions = [];
            scriptFileNames = orderFiles(scriptFileNames);
            scriptFileNames.forEach(function(scriptFileName) {
                var scriptVersion = getScriptVersion(scriptFileName);
                var scriptName = getScriptName(scriptFileName);
                if (scriptVersion > lastVersion) {
                    var scriptContent = getFileContent(scriptFileName, 'schema');
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
            var procs = fs.readdirSync(path.join(__dirname, 'procedures'));
        } catch (e) {
            return callback(new Error('unable_to_read_procs_directory'));
        }

        var procActions = [];

        procs.forEach(function (filename) {
            var content = getProcContent(filename);
            var md5Hash = md5(content);
            var name = getProcName(content);
            if (!name) return;
            procActions = procActions.concat([
                function (cb) {
                    var values = {md5: md5Hash, name: name, content: content};
                    cb(null, values);
                },
                storedProcedureMethods.getLatestMd5,
                storedProcedureMethods.checkUpdateRequired,
                storedProcedureMethods.getCurrentProcForRollback,
                storedProcedureMethods.insertAttemptIntoHistoryAsPending,
                storedProcedureMethods.dropCurrentProc,
                storedProcedureMethods.createNewProcOrRollback,
                storedProcedureMethods.recordUpdateHistory
            ]);
        });

        async.waterfall(procActions, function (err) {
            if (err) return callback(err);
            console.log('| Done');
            console.log(solidLine);

            callback()
        });
    }

    function getProcContent(filename) {
        return fs.readFileSync(path.join(__dirname, 'procedures', filename), {encoding: 'utf8'});
    }

    function getFileContent(filename, folder) {
        return fs.readFileSync(path.join(__dirname, folder, filename), {encoding: 'utf8'});
    }

    function getProcName(content) {
        var procNameRegex = /create procedure\s?`?'?"?([a-z0-9]*)\(?\)?/i;
        var match = content.match(procNameRegex);
        if (match && match.length > 0) return match[1];
        return false;
    }

    function validateOptions(options) {
        var errors = [];

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

};