var mysql = require('mysql');

module.exports = function(options) {

    var db1 = mysql.createConnection({
        host: options.host,
        user: options.user,
        password: options.password,
        multipleStatements: true
    });


    var db2 = mysql.createConnection({
        host: options.host,
        user: options.user,
        password: options.password,
        database: options.database,
        multipleStatements: true
    });

    function checkIfDatabaseExists(callback) {

        var sql = 'show databases like "' + options.database + '"';
        db1.query(sql, function(err, result) {
            if (err) return callback(err);
            var exists = result.length > 0;
            return callback(null, exists);
        })
    }

    function createDatabase(exists, callback) {
        if (exists) return callback();
        console.log('| Database does not exist');
        console.log('| Creating database');
        var sql = 'CREATE DATABASE ' + options.database + ' CHARACTER SET utf8 COLLATE utf8_general_ci';
        db1.query(sql, function(err) {
            if (err) return callback(err);
            console.log('| Database created successfully');
            callback();
        });
    }

    function checkIfScriptHistoryTableExists(callback) {
        var sql = 'show tables like "database_script_history"';
        db2.query(sql, function(err, result) {
            if (err) return callback(err);
            var exists = result.length > 0;
            callback(null, exists);
        });
    }

    function createScriptHistory(exists, callback) {
        if (exists) return callback();
        console.log('| Database script history table missing');
        console.log('| Creating missing table');
        var sql = 'create table database_script_history (' +
                    'version int unsigned not null primary key,' +
                    'createdAt datetime null,' +
                    'name varchar(100),' +
                    'status varchar(10) null)';
        db2.query(sql, function(err) {
            if (err) return callback(err);
            console.log('| Table created successfully');
            callback();
        });
    }

    function checkIfProcHistoryTableExists(callback) {
        var sql = 'show tables like "database_proc_history"';
        db2.query(sql, function(err, result) {
            if (err) return callback(err);
            var exists = result.length > 0;
            callback(null, exists);
        });
    }

    function createProcHistory(exists, callback) {
        if (exists) return callback();
        console.log('| Database procedure history table missing');
        console.log('| Creating missing table');
        var sql = 'create table database_proc_history (' +
                    'id int unsigned auto_increment not null primary key,' +
                    'name varchar(100) not null,' +
                    'md5 varchar(32) not null,' +
                    'createdAt datetime null,' +
                    'status varchar(10),' +
                    'index (name))';

        db2.query(sql, function(err) {
            if (err) return callback(err);
            console.log('| Table created successfully');
            callback();
        });
    }

    return {
        checkIfDatabaseExists: checkIfDatabaseExists,
        createDatabase: createDatabase,
        checkIfScriptHistoryTableExists: checkIfScriptHistoryTableExists,
        createScriptHistory: createScriptHistory,
        checkIfProcHistoryTableExists: checkIfProcHistoryTableExists,
        createProcHistory: createProcHistory
    };
};