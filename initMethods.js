var async = require('async');
var mysql = require('mysql');

module.exports = function(options) {
    var db = mysql.createConnection({
        host: options.host,
        user: options.user,
        password: options.password,
        database: options.database,
        multipleStatements: true
    });

    function updateLockTableWithLockCode(lockCode, localIp, callback) {
        var sql = 'update database_update_lock set lastLockedAt=now(), lockedWith=?, lastLockedByIp=? ' +
            'where lockedWith is null ' +
            'or ' +
            'now() > lastLockedAt + interval 2 minute';
        db.query(sql, [lockCode, localIp], function(err) {
            if (err) return callback(err);
            callback(null, lockCode);
        });
    }

    function checkLockIsValid(lockCode, callback) {
        var sql = 'select lockedWith from database_update_lock where lockedWith=?';
        db.query(sql, [lockCode], function(err, result) {
            if (err) return callback(err);
            callback(null, result.length > 0);
        });
    }

    function waitForUnlock(callback) {
        var unlocked = false;
        var isUnlocked = function() {
            return unlocked;
        };
        console.log('| waiting database to unlock');
        async.until(isUnlocked, function(cb) {
            console.log('| .');
            var sql = 'select lockedWith from database_update_lock where lockedWith is null ' +
                        'or ' +
                        'now() > lastLockedAt + interval 2 minute';
            db.query(sql, function(err, result) {
                if (err) return cb(err);
                if (result.length > 0) unlocked = true;
                setTimeout(function() {
                    cb();
                }, 1000);
            });
        }, function(err) {
            if (err) return callback(err);
            callback();
        });
    }

    function unlockLockTable(callback) {
        var sql = 'update database_update_lock set lockedWith=null where id=1';
        db.query(sql, function(err) {
            if (err) return callback(err);
            callback();
        });
    }

    return {
        updateLockTableWithLockCode: updateLockTableWithLockCode,
        checkLockIsValid: checkLockIsValid,
        unlockLockTable: unlockLockTable,
        waitForUnlock: waitForUnlock
    };
};