#!/usr/bin/env node

const chalk = require("chalk");
const boxen = require("boxen");
const yargs = require("yargs");
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const readline = require('readline');
const { check, updateLocale } = require("yargs");
const { exit } = require("process");
const clear = require('clear');

var bookmarks = new Array();
var current = "";
var result = {};

/* ASCII codes for entering or leaving full screen mode */
const enterAltScreenCommand = '\x1b[?1049h';
const leaveAltScreenCommand = '\x1b[?1049l';

/* Path to file containing bookmarks */
const bookmarksFile = os.homedir() + "/.config/blast/bookmarks.json";
const commandFile = os.homedir() + "/.config/blast/command.sh";

/* Possible cli input parameters */
const options = yargs
 .usage("Usage: -keyword <name>")
 .option("n", { alias: "name", describe: "name of bookmark", type: "string", demandOption: false })
 .option("h", { alias: "history", describe: "previous command", type: "string", demandOption: false })
 .option("a", { alias: "action", describe: "status: error or success", type: "string", demandOption: false })
 .argv;

/* Make sure no command is run unintentionally */
fs.writeFileSync(commandFile, "");

/* Fetch existing bookmarks */
let rawdata = fs.readFileSync(bookmarksFile);
bookmarks = JSON.parse(rawdata);

/* Exit with error if bookmarks file not found */
if (!fs.existsSync(bookmarksFile)) {
	console.log("Error: bookmarks file does not exists");
	return;
}

if (options.action == "save") {
	/* 
	* Bookmark command specified at cli
	*/

	/* Avoid recursion */
	if (options.history.startsWith("blast")) {
		console.log("\n    " + chalk.red("Blasting blast is not sane...aborting!") + "\n");
		return;
	}

	let saveBookmark = function() {
		console.log("Bookmarking last command as " + chalk.yellow.bold(options.name) + ":");
		console.log(chalk.bold.green(options.history));

		/* Store bookmark */
		bookmarks[options.name] = options.history;

		let data = JSON.stringify(bookmarks, null, 4);
		fs.writeFileSync(bookmarksFile, data);
	}

	if (options.name in bookmarks) {
		/* Have user confirm overwrite */
		let rl = readline.createInterface(process.stdin, process.stdout);
		rl.question("A bookmark with this name already exists. Replace? [yes]/no: ", function (answer) {
			if (answer == "no" || answer == "n") {
				console.log("Aborted");
				process.exit(1);
			} else {
				saveBookmark();
				exit();
			}
		});
	} else {
		saveBookmark();
	}
} else if (options.action == "delete") {
	/*
	* Delete bookmark specified at cli
	*/

	if (options.name in bookmarks) {
		delete bookmarks[options.name];

		let data = JSON.stringify(bookmarks, null, 4);
		fs.writeFileSync(bookmarksFile, data);

		console.log("Deleting bookmark: " + chalk.yellow.bold(options.name));
	} else {
		console.log(chalk.red("Bookmark does not exist: ") + chalk.yellow.bold(options.name));
	}
} else if (options.action == "show") {
	/*
	* Show bookmarks matching string specified at cli
	*/
	
	let found = 0;

	for (let key of Object.keys(bookmarks)) {
		if ( key.toLowerCase().startsWith(options.name.toLowerCase()) ) {
			found++;

			console.log("\n    Bookmark " + chalk.yellow.bold(key + ":"));
			console.log("    " + chalk.bold.green(bookmarks[key]) + "\n");
		}
	}

	if (found == 0) {
		console.log("\n    " + chalk.red("No bookmarks found matching: ") + chalk.yellow.bold(options.name) + "\n");
	}
} else if (options.action == "use") {
	/*
	* Run command specified at cli
	*/

	if (options.name in bookmarks) {
		const command = chalk.green.bold(bookmarks[options.name]);
		console.log("\n" + command);

		/* Have user confirm */
		let rl = readline.createInterface(process.stdin, process.stdout);
		rl.question("Run this command? [yes]/no: ", function (answer) {
			if (answer == "no" || answer == "n") {
				console.log("Aborted");
				process.exit(1);
			} else {
				console.log("Running command...\n");

				fs.writeFileSync(commandFile, bookmarks[options.name]);
				rl.close();
				return;
			}
		});
	} else {
		console.log("\n    " + chalk.red("No bookmark found matching: ") + chalk.yellow.bold(options.name) + "\n");
	}
}
else if (options.action = "showall") {
	/*
	 * Show GUI
	 */

	/* Enter fullscreen */
	process.stdout.write(enterAltScreenCommand);

	if (!fs.existsSync(bookmarksFile)) {
		fs.writeFileSync(commandFile, "");
		console.log("Bookmarks file does not exist"); // TODO: create file if not found
	} else {
		/* Start GUI */
		handleKeyboardEvents();
	}
} else {
	console.log("Error: " + options.status); // TODO: better error handling
}


/**
 * Handle user GUI interaction
 */
function handleKeyboardEvents() {
	/* Draw GUI initially */
	redrawGUI();

	process.stdin.currentLine = '';
	process.stdin.setRawMode(true);

	var listener = process.stdin.on('data', this.eventListener = (buf) => {
		const charAsAscii = buf.toString().charCodeAt(0);

		// console.log(charAsAscii);

		switch (charAsAscii) {
			case 38:
				clear();
				break;

			/* Ctrl-c */
			case 0x03:
				console.log('Exiting..');

				process.stdout.write(leaveAltScreenCommand);
				process.kill(process.pid, 'SIGINT');
				break;

			/* Esc */
			case 27:
				console.log('Exiting..');

				process.stdout.write(leaveAltScreenCommand);
				process.kill(process.pid, 'SIGINT');
				break;
			
			/* Backspace */
			case 127:
				current = current.slice(0, -1);
				redrawGUI();

				break;

			/* Tab */
			case 0x09:
				redrawGUI();
				break;

			/* Enter */
			case 13:
				let keys = Object.keys(result);
				if (keys.length == 1) {
					console.log("\nRunning command " + chalk.yellow.bold(keys[0]) + ": " + chalk.green(bookmarks[keys[0]]) + "\n");

					process.stdout.write(leaveAltScreenCommand);
					fs.writeFileSync(commandFile, bookmarks[keys[0]]);
					exit();
				}

				break;

			/* User input */
			default:
				current += String.fromCharCode(charAsAscii);
				redrawGUI();

				break;
		}
	});
}


/**
 * Redraw GUI after user interaction
 */
function redrawGUI() {
	result = {};

	const match = chalk.green.bold;
	const noMatch = chalk.white;
	const tableBorder = chalk.white;
	const usage = chalk.white;

	readline.cursorTo(process.stdout, 0, 0);
	readline.clearScreenDown(process.stdout); // process.stdout.write("\x1Bc")
	readline.cursorTo(process.stdout, 0, 60);

	let maxKeyLength = 0;
	for (let key of Object.keys(bookmarks)) {
		maxKeyLength = Math.max(key.length, maxKeyLength);
	}

	maxKeyLength = Math.max(maxKeyLength, 25);

	console.log( chalk.yellow.bold("Usage\n") );
	console.log( usage("blast as ") + chalk.blue("'bookmark-name'") + "     <- Save bookmark");
	console.log( usage("blast ") + chalk.blue("'bookmark-name'") + "        <- Run bookmarked command");
	console.log( usage("blast delete ") + chalk.blue("'bookmark-name'") + " <- Delete bookmark" );
	console.log( usage("blast show ") + chalk.blue("'bookmark-name'") + "   <- List bookmarks starting with specified string");

	process.stdout.write( "\n" + chalk.bgWhite.black(" ^C / Esc ") + " Exit" + "\n" );

	process.stdout.write( tableBorder("╭") );
	process.stdout.write( tableBorder("─".repeat(maxKeyLength + 2)) );
	process.stdout.write( tableBorder("┬") );
	process.stdout.write( tableBorder("─".repeat(80)) );
	process.stdout.write( tableBorder("╮\n") );

	for (let key of Object.keys(bookmarks)) {
		let commandAlias = key.padEnd(maxKeyLength, " ");
		let command = bookmarks[key].padEnd(78, " ");

		if ( current != "" && key.toLowerCase().startsWith(current.toLowerCase()) ) {
			result[key] = bookmarks[key];
			commandAlias = match(commandAlias);
			command = match(command);
		} else {
			commandAlias = noMatch(commandAlias);
			command = noMatch(command);
		}

		process.stdout.write( tableBorder("│ ") );
		process.stdout.write(commandAlias);
		process.stdout.write( tableBorder(" │ ") );
		process.stdout.write(command);
		process.stdout.write(" │\n");

		process.stdout.write( tableBorder("│") );
		process.stdout.write( tableBorder("╌".repeat(maxKeyLength + 2)) );
		process.stdout.write( tableBorder("┼") );
		process.stdout.write( tableBorder("╌".repeat(80)) );
		process.stdout.write( tableBorder("│\n") );
	
	}

	process.stdout.write( tableBorder("╰") );
	process.stdout.write( tableBorder("─".repeat(maxKeyLength + 2)) );
	process.stdout.write( tableBorder("┴") );
	process.stdout.write( tableBorder("─".repeat(80)) );
	process.stdout.write( tableBorder("╯\n") );

	/* Update input line */
	if (Object.keys(result).length == 1) {
		process.stdout.write(chalk.white(": "));
		process.stdout.write(chalk.yellow.bold(current));
	} else {
		process.stdout.write(chalk.reset(": " + current));
	}
}

function checkIfStringStartsWith(str, substrs) {
	return substrs.some(substr => str.toLowerCase().startsWith(substr.toLowerCase()));
}
