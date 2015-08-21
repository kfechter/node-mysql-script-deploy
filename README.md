# mysql-deploy
---

This useful little package takes the pain out of updating keeping your database up to date,
whether in the development environent or production.

## Installation
```
sudo npm install mysql-deploy --save
```


## Usage

Call scriptDeploy method at the end of your main script before your app finishes starting. In an ExpressJS app I place the app.listen() inside the callback function so my server won't start untill all the scripts have deployed.

```javascript
var scriptDeploy = require('mysql-deploy ');

var options = {
    host 				: 'example_host',
	port				: 33306,
    user 				: 'username',
    password 			: 'password',
    database 			: 'example_database',
    schemaLocation		: path.join(__dirname, 'databaseScripts', 'schemaScripts'), 
    routinesLocation	: path.join(__dirname, 'databaseScripts', 'routineScripts') 
};

scriptDeploy(options, function(err) {
	if (err) throw err;
	app.listen(3000);
});
```

## Schema scripts

All schema scripts should be placed in the folder specified by the ```schemaLocation``` option.

 - All script files should begin with the version number followed by a descriptive name.
 - Script files can contain multiple statements
 - If a script file fails to run correct the script and restart your application ( you may have to wait for two minutes for scirpt-deploy to unlock)
 - Once a script has successfully run it will not run again, even if the file is changed.

## Routines

All routines should be places in the folder specified by the ```routinesLocation``` option.

 - Name your routine script files the same as the routines themselves (this is not a requirement, just advice really)
 - To change a routine simply modify the file. Next time your node application starts it will know the routine has changed, drop and recreate it.
 - Currently stored procedures and functions will both work.
 - Do not use the ```DELIMETER``` syntax in your routines, it is not only unnecessary but will cause the scripts to fail.

Example syntax for function script

```mysql
CREATE FUNCTION SqrRt (x1 decimal, y1 decimal)
RETURNS decimal
DETERMINISTIC
BEGIN
  DECLARE dist decimal;
  SET dist = SQRT(x1 - y1);
  RETURN dist;
END
```

## Options

  - host: The database host name/IP address for the MySql database server you wish to connect to.
  - user : The database username you wish to use to connect to the database. This user must have all the rights that your stored procdures and functions require aswell as the rights to perform the functions in the schema scripts.
  - password: The database password for the above user.
  - database: The name of the database that you wish to run all the scripts on.
  - schemaLocation: The folder location of the schema change scripts, this should be an absolute path.
  - routinesLocation: The folder location of the schema change scripts, this should be an absolute path.

## Create database

 If the database name in the database options does not exist, mysql-deploy will attempt to create it. If it fails for any reason, lack of permissions or incorrect connection details, it will halt and no futher scripts will run.

## mysql-deploy management tables

mysql-deploy creates 3 tables the first time you run it in an app. These table will live on the database named in the database option. They are used to track the versions of the schema scripts, functions and stored procedures. It is best to avoid modifying or manually adding any data in these tables.

These tables are:
 - database_update_lock
 - database_script_history
 - database_routine_history

## Locking

When running, mysql-deploy locks itself to prevent other instances of mysql-deploy from running at the same time. This lock only lasts for two minutes so please be patient.




