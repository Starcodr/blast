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
// import process from 'node:process';

var bookmarks = new Array();
var current = "";
var matches = {};

const GUI_MODE_RUN = 1;
const GUI_MODE_DELETE = 2;
var guiMode = 1;

const LIST_MINIMUM_NAME_WIDTH = 25;
const LIST_MAXIMUM_COMMAND_WIDTH = 80;
const LABEL_TITLE = "BLAST - Bookmark management interface";
const LABEL_TITLE_WIDTH = LABEL_TITLE.length;
const LIST_NUMBER_COLUMN_WIDTH = 5;

/* ASCII codes for entering or leaving full screen mode */
const enterAltScreenCommand = '\x1b[?1049h';
const leaveAltScreenCommand = '\x1b[?1049l';

/* Path to file containing bookmarks etc. */
const configDirectory = os.homedir() + "/.config/blast";
const bookmarksFile = os.homedir() + "/.config/blast/bookmarks.json";
const commandFile = os.homedir() + "/.config/blast/command.sh";

/* Possible cli input parameters */
const options = yargs
 .usage("Usage: -keyword <name>")
 .option("n", { alias: "name", describe: "name of bookmark", type: "string", demandOption: false })
 .option("h", { alias: "history", describe: "previous command", type: "string", demandOption: false })
 .option("a", { alias: "action", describe: "status: error or success", type: "string", demandOption: false })
 .argv;

/* Create required files if they do not exists already */
if (!fs.existsSync(bookmarksFile)) {
	fs.writeFile(bookmarksFile, '{}', function (err) {});
}

if (!fs.existsSync(commandFile)) {
	fs.writeFile(commandFile, '{}', function (err) {});
}

/* Make sure no command is run unintentionally */
fs.writeFileSync(commandFile, "");

/* Fetch existing bookmarks */
let rawdata = fs.readFileSync(bookmarksFile);
if (rawdata.toString().trim() == "") rawdata = "{}";

try {
	bookmarks = JSON.parse(rawdata);
} catch(error) {
	bookmarks = "{}";
	console.log("error: " + error);
}

/* Exit with error if bookmarks file not found */
if (!fs.existsSync(bookmarksFile)) {
	console.log("Error: bookmarks file does not exists");
	return;
}

options.name = options.name.trim();

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
		console.log("Bookmarking previous history entry as " + chalk.yellow.bold(options.name) + ":");
		console.log(chalk.bold.green(options.history));

		/* Store bookmark */
		bookmarks[options.name] = options.history;
		const ordered = Object.fromEntries(Object.entries(bookmarks).sort(
			(a, b) => a[0].localeCompare(b[0])
		));

		let data = JSON.stringify(ordered, null, 4);
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
		if ( key.toLowerCase().includes(options.name.toLowerCase()) || options.name == "$" ) {
			found++;

			if (found == 1) {
				process.stdout.write("\n");
			}

			process.stdout.write("    Bookmark " + chalk.yellow.bold(key + ": "));
			console.log(chalk.italic(bookmarks[key]));
		}
	}

	if (found == 0) {
		console.log("\n    " + chalk.red("No bookmarks found matching: ") + chalk.yellow.bold(options.name));
	}

	process.stdout.write("\n");
} else if (options.action == "use") {
	/*
	* Run command specified at cli
	*/

	if (options.name in bookmarks) {
		const command = chalk.green.bold(bookmarks[options.name]);
		console.log("\n" + command);

		/* Have user confirm */
		let rl = readline.createInterface(process.stdin, process.stdout);
		rl.question("Execute this command? [yes]/no: ", function (answer) {
			if (answer == "no" || answer == "n") {
				console.log("Aborted");
				process.exit(1);
			} else {
				console.log("Executing command...\n");

				fs.writeFileSync(commandFile, bookmarks[options.name]);
				rl.close();
				return;
			}
		});
	} else {
		console.log("\n    " + chalk.red("No bookmark found matching: ") + chalk.yellow.bold(options.name) + "\n");
	}
} else if (options.action = "showall") {
	/*
	 * Show GUI
	 */

	/* Enter fullscreen */
	process.stdout.write(enterAltScreenCommand);

	if (!fs.existsSync(bookmarksFile)) {
		fs.writeFileSync(commandFile, "");
		console.log("Bookmarks file does not exist"); // TODO: create file if not found
	} else {
		/* Draw GUI initially */
		findMatches();
		redrawGUI();
		handleKeyboardEvents();
		process.stdin.resume();
	}
} else {
	console.log("Error: " + options.status); // TODO: better error handling
}


/**
 * Handle user GUI interaction
 */
function handleKeyboardEvents() {
	process.stdin.currentLine = '';
	process.stdin.setRawMode(true);

	var listener = process.stdin.on('data', this.eventListener = (buf) => {
		const charAsAscii = buf.toString().charCodeAt(0);

		// console.log(charAsAscii);

		/* Avoid exiting when arrow keys pressed */
		if (buf.toString().length == 3) {
			let x = buf.toString().charCodeAt(2);
			if ([65, 66, 67, 68].includes(x)) return;
		}

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

			/* Ctrl-d */
			case 0x04:
				if (guiMode == GUI_MODE_DELETE) {
					guiMode = GUI_MODE_RUN;
					current = "";
					redrawGUI();
				} else {
					guiMode = GUI_MODE_DELETE;
					current = "";
					redrawGUI();
				}

				break;

			/* Esc */
			case 27:
				if (guiMode == GUI_MODE_DELETE) {
					current = "";
					guiMode = GUI_MODE_RUN;
					redrawGUI();
					break;
				}

				console.log('Exiting..');

				process.stdout.write(leaveAltScreenCommand);
				process.kill(process.pid, 'SIGINT');

				break;
			
			/* Backspace */
			case 127:
				current = current.slice(0, -1);

				findMatches();
				redrawGUI();

				break;

			/* Tab */
			case 0x09:
				autoComplete(); // fs.appendFileSync("/home/x/debug.log", "tab current = " + current + "\n");
				findMatches();
				redrawGUI();

				break;

			/* Enter */
			case 13:
				let exactMatchIndex = Object.values(matches).indexOf(2);
				if (exactMatchIndex > -1) {
					let commandName = Object.keys(matches)[exactMatchIndex];

					process.stdout.write(leaveAltScreenCommand);
					fs.writeFileSync(commandFile, bookmarks[commandName]);
					console.log("\nExecuting command " + chalk.yellow.bold(commandName) + ": " + chalk.italic(bookmarks[commandName]) + "\n");

					exit();
				}

				break;
						
			/* User input */
			default:
				if (guiMode == GUI_MODE_DELETE) {
					if (is_numeric(String.fromCharCode(charAsAscii))) {
						current += String.fromCharCode(charAsAscii);
					}
				} else {
					current += String.fromCharCode(charAsAscii);
				}

				findMatches();
				redrawGUI();

				break;
		}
	});
}

/**
 * Keeps skipping forward in command names until 
 */
function autoComplete() {
	let nextCharacters = {};

	let max = current.length;
	for (let key of Object.keys(bookmarks)) {
		if ( key.toLowerCase().startsWith(current.toLowerCase()) ) {
			max = Math.max(key.length, max);
		}
	}

	for (let key of Object.keys(bookmarks)) {
		if ( key.toLowerCase().startsWith(current.toLowerCase()) ) {
			key = key.padEnd(max, " ");

			if (key.length > current.length) {
				let keyAfter = key.substring(current.length, current.length + 1);
				nextCharacters[keyAfter] = keyAfter;
			}
		}
	}

	if (Object.keys(nextCharacters).length == 1) {
		current += nextCharacters[Object.keys(nextCharacters)[0]]
		autoComplete();
	} else {
		return;
	}
}

/**
 * Update datastructure with match states
 */
function findMatches() {
	for (let key of Object.keys(bookmarks)) {
		if ( current != "" && key.toLowerCase().startsWith(current.toLowerCase()) ) {
			key.toLowerCase() == current.toLowerCase() ? matches[key] = 2 : matches[key] = 1;
		} else {
			matches[key] = 0;
		}
	}
}

/**
 * Redraw GUI after user interaction
 */
function redrawGUI() {
	exactMatch = "";

	const match = chalk.white;
	const matchUnique = chalk.green;
	const noMatch = chalk.white;
	const tableBorder = chalk.white;
	const usage = chalk.white;

	/* Prepare/clear screen */
	readline.cursorTo(process.stdout, 0, 0);
	readline.clearScreenDown(process.stdout); // process.stdout.write("\x1Bc")
	readline.cursorTo(process.stdout, 0, 60);

	/* Find width of name column */
	let nameColumnWidth = 0;
	for (let key of Object.keys(bookmarks)) {
		nameColumnWidth = Math.max(key.length, nameColumnWidth);
	}
	nameColumnWidth = Math.max(nameColumnWidth, LIST_MINIMUM_NAME_WIDTH); // Minimum 25 characters wide

	/* Find available space for command and width of table */
	let remainingWidth = terminalWidth() - LIST_NUMBER_COLUMN_WIDTH - nameColumnWidth - 7; // 7 = padding and borders
	let commandWidth = Math.max( Math.min(remainingWidth, LIST_MAXIMUM_COMMAND_WIDTH), 0 );

	/* Title and menu */
	let menuWidth = (" ^D Delete " + "^C/Esc Exit").length;
	let menu = chalk.bgWhite.black(" ^D ") + " Delete " + chalk.bgWhite.black(" ^C/Esc ") + " Exit";
	let tableWidth = nameColumnWidth + commandWidth + LIST_NUMBER_COLUMN_WIDTH + 4;

	process.stdout.write( tableBorder("─".repeat(LABEL_TITLE_WIDTH)) + "\n");
	process.stdout.write( chalk.yellow.bold(LABEL_TITLE) );
	if (menuWidth + LABEL_TITLE_WIDTH + 4 > terminalWidth()) process.stdout.write( "\n" );
	readline.cursorTo(process.stdout, tableWidth - menuWidth);
	process.stdout.write( menu );
	process.stdout.write( "\n" );

	/* Usage info */
	console.log( "\n" + chalk.yellow("Usage:") );
	console.log( usage("blast as ") + chalk.blue("'bookmark-name'") + "     <- Save bookmark");
	console.log( usage("blast ") + chalk.blue("'bookmark-name'") + "        <- Execute bookmarked command");
	console.log( usage("blast delete ") + chalk.blue("'bookmark-name'") + " <- Delete bookmark" );
	console.log( usage("blast show ") + chalk.blue("'bookmark-name'") + "   <- List bookmarks starting with specified string\n");

	/* Draw top border of table */
	process.stdout.write( tableBorder("╭────┬" + "─".repeat(nameColumnWidth + 2)) );
	process.stdout.write( tableBorder("┬" + "─".repeat(commandWidth + 2) + "╮\n") );

	/* Find last matching name for avoiding to include divider after last list entry */
	let lastMatch = "";
	Object.keys(matches).forEach(function(value, index, array) {
		if (matches[value] == 1 || matches[value] == 2) lastMatch = value;
	});
	let lastName = Object.keys(matches).pop();

	/* Draw line for each bookmark in table */
	for (let key of Object.keys(matches)) {
		let commandName = key.padEnd(nameColumnWidth, " ");
		let command = bookmarks[key].padEnd(commandWidth, " ");

		switch (matches[key]) {
			case 0:
				commandName = noMatch(commandName);
				command = noMatch(command);
					break;

			case 1:
				commandName = match(commandName);
				command = match(command);
				break;

			case 2:
				exactMatch = key;
				commandName = matchUnique(commandName);
				command = matchUnique(command);
				break;
		}

		let numberColumn = (Object.keys(bookmarks).indexOf(key) + 1).toString().padStart(2, " ");

		/* Bookmark line */
		if (current == "" || matches[key] == 1 || matches[key] == 2) {
			process.stdout.write( tableBorder("│ ") + numberColumn + tableBorder(" │ ") );
			process.stdout.write( commandName + tableBorder(" │ ") + command + tableBorder(" │\n") );

			/* Divider, but omit if this key is last in the list of matching names */
			if (key != lastMatch && lastName != key) {
				process.stdout.write( tableBorder("│╌╌╌╌┼" + "╌".repeat(nameColumnWidth + 2)) );
				process.stdout.write( tableBorder("┼" + "╌".repeat(commandWidth + 2) + "│\n") );
			}
		}
	}
		
	/* Draw bottom border of table */
	process.stdout.write( tableBorder("╰────┴" + "─".repeat(nameColumnWidth + 2)) );
	process.stdout.write( tableBorder("┴" + "─".repeat(commandWidth + 2) + "╯\n") );

	/* Update input line */
	if (exactMatch != "") {
		let command = bookmarks[exactMatch]
		// console.log("\n  " + chalk.green.bold(command));
		console.log(chalk.green("\nMatch found: press enter to execute command"));
		process.stdout.write(": " + current);
	} else {
		if (guiMode == GUI_MODE_RUN) {
			console.log(chalk.yellow("\nSpecify name of command to execute:"));
			// process.stdout.write(chalk.reset(": " + current));
			process.stdout.write(": " + current);
		} else {
			console.log(chalk.yellow("\nSpecify number of command to delete and press enter:"));
			process.stdout.write(": " + current);
		}
	}
}

process.on('SIGWINCH', () => {
	redrawGUI();
});

function is_numeric(string) {
	return /^\d+$/.test(string);
}

function terminalWidth() {
	return process.stdout.getWindowSize()[0];
}


// /* Arrow keys */
// case 28:
// 	break;
// case 0x4B:
// 	break;
// case 0x4D:
// 	break;
// case 0x48:
// 	break;

// Object.keys(matches).forEach(function(value, index, array) {
// 	fs.appendFileSync("/home/x/debug.log", value + " = " + matches[value] + "\n");
// });
