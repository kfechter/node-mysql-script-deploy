var mysql = require('mysql');

module.exports = function(options) {

    var STATUS = {
        PENDING: 'pending',
        SUCCESS: 'success',
        FAILED: 'failed'
    };

    var db = mysql.createConnection({
        host: options.host,
        user: options.user,
        password: options.password,
        database: options.database,
        multipleStatements: true
    });

    function getLastVersionNumber(callback) {
        var sql = 'select version from database_script_history where status="success" order by version desc limit 1';
        db.query(sql, function(err, result) {
            if (err) return callback(err);
            var lastVersion = 0;
            if (result.length > 0) lastVersion = result[0].version;
            callback(null, lastVersion);
        });
    }

    function insertAttemptIntoHistoryAsPending(values, callback) {
        var sql = 'insert into database_script_history (version, status, name) values (?, ?, ?)';
        db.query(sql, [values.scriptVersion, STATUS.PENDING, values.name], function(err) {
            if (err) return callback(err);
            callback(null, values);
        })
    }

    function executeScript(values, callback) {
        db.query(values.scriptContent, function(err) {
            if (err) {
                updateHistory(STATUS.FAILED, new Date(), values.scriptVersion, function() {
                    console.warn('| Script version "%d" failed to apply.', values.scriptVersion);
                    callback(err);
                });
            } else {
                updateHistory(STATUS.SUCCESS, new Date(), values.scriptVersion, function(err) {
                    if (err) return callback(err);
                    console.log('| Script version "%d" was successfully applied to the database.', values.scriptVersion);
                    callback();
                })
            }
        })
    }

    // PRIVATE FUNCTIONS
    function updateHistory(status, createdAt, version, callback) {
        var sql = 'update database_script_history set status=?, createdAt=? where version=? and status="pending"';
        db.query(sql, [status, createdAt, version], function(err) {
            if (err) return callback(err);
            callback();
        })
    }

    return {
        getLastVersionNumber: getLastVersionNumber,
        insertAttemptIntoHistoryAsPending: insertAttemptIntoHistoryAsPending,
        executeScript: executeScript
    };

};