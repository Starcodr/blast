#!/usr/bin/env node

const chalk = require("chalk");
const cfonts = require('cfonts');
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
var selectedForDeletion = -1;

const GUI_MODE_RUN = 1;
const GUI_MODE_DELETE = 2;
const GUI_MODE_CONFIRM_DELETE = 3;
var guiMode = 1;
var fitToWidth = false;
var currentPage = 1;
let numberOfPages = 1;
let numberOfVisibleRows = 0;

const LIST_MINIMUM_NAME_WIDTH = 25;
const LIST_MAXIMUM_COMMAND_WIDTH = 90;
const LABEL_TITLE = " Bookmark management interface";
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
	fs.writeFile(bookmarksFile, '{}', function (err) {});
}

options.name = options.name.trim();

for (let i = 1; i < 200; i++) {
	bookmarks["test" + i] = "en test command";
}

/**
 * Handle possible command line actions
 */
switch (options.action) {
	/* Bookmark the command specified at cli */
	case "save":
		saveBookmark();
		break;

	/* Delete bookmark specified at cli	*/
	case "delete":
		deleteBookmark();
		break;

	/* Show bookmarks matching string specified at cli */
	case "show":
		showMatchingBookmarks();
		break;

	/* Run the command of the bookmark specified at cli	*/
	case "use":
		useBookmark();
		break;

	/* Show GUI	*/
	case "showall":
		process.stdout.write(enterAltScreenCommand); // Enter fullscreen
		findMatches();
		redrawGUI();
		handleKeyboardEvents();
		process.stdin.resume();

		break;

	default:
		console.log("Error: " + options.status); // TODO: better error handling
		process.exit(1);
		break;
}

/**
 * Save bookmark
 */
function saveBookmark() {
	/* Avoid recursion */
	if (options.history.startsWith("blast")) {
		console.log("\n    " + chalk.red("Blasting blast is not sane...aborting!") + "\n");
		return;
	}

	let _saveBookmark = function() {
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
				_saveBookmark();
				exit();
			}
		});
	} else {
		_saveBookmark();
	}
}

/**
 * Delete bookmark
 */
function deleteBookmark() {
	if (options.name in bookmarks) {
		delete bookmarks[options.name];

		let data = JSON.stringify(bookmarks, null, 4);
		fs.writeFileSync(bookmarksFile, data);

		console.log("Deleting bookmark: " + chalk.yellow.bold(options.name));
	} else {
		console.log(chalk.red("Bookmark does not exist: ") + chalk.yellow.bold(options.name));
	}
}

/**
 * Displays all bookmarks with name matching the string given on command line.
 */
function showMatchingBookmarks() {
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
}

/**
 * Run the choosen command
 */
function useBookmark() {
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
}

/**
 * Handle user GUI interaction
 */
function handleKeyboardEvents() {
	process.stdin.currentLine = '';
	process.stdin.setRawMode(true);

	var listener = process.stdin.on('data', this.eventListener = (buf) => {
		const charAsAscii = buf.toString().charCodeAt(0);

		// fs.appendFileSync("/home/lars/debug.log", "char code = " + charAsAscii + "\n");

		if (buf == '\u001B\u005B\u0041') { // up
			if (currentPage > 1) currentPage--;
			// fs.appendFileSync("/home/lars/debug.log", "up pressed, num matches = " + numberOfVisibleRows + " - new current page = " + currentPage + "\n");
			redrawGUI();
			return;
		}
		if (buf == '\u001B\u005B\u0043') {
			return;
			// process.stdout.write('right'); 
		}
		if (buf == '\u001B\u005B\u0042') {
			if (currentPage < numberOfPages) currentPage++;
			// fs.appendFileSync("/home/lars/debug.log", "down pressed, num matches = " + numberOfVisibleRows + " - new current page = " + currentPage + "\n");
			redrawGUI();
			return;
		}
		if (buf == '\u001B\u005B\u0044') {
			return;
			// process.stdout.write('left'); 
		}

		/* Avoid exiting when arrow keys pressed */
		// if (buf.toString().length == 3) {
		// 	let x = buf.toString().charCodeAt(2);
		// 	if ([65, 66, 67, 68].includes(x)) return;
		// }

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
					for (let key of Object.keys(bookmarks)) {
						matches[key] = 1;
					}
					redrawGUI();
				}

				break;

			/* Ctrl-f */
			case 0x06:
				fitToWidth = !fitToWidth;
				redrawGUI();

				break;

			/* Esc */
			case 27:
				if (guiMode != GUI_MODE_RUN) {
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

				if (guiMode == GUI_MODE_RUN) {
					findMatches();
				}
				redrawGUI();

				break;

			/* Tab */
			case 0x09:
				autoComplete();
				findMatches();
				redrawGUI();

				break;

			/* Enter */
			case 13:
				switch (guiMode) {
					case GUI_MODE_RUN:
						let exactMatchIndex = Object.values(matches).indexOf(2);
						if (exactMatchIndex > -1) {
							let commandName = Object.keys(matches)[exactMatchIndex];
	
							process.stdout.write(leaveAltScreenCommand);
							fs.writeFileSync(commandFile, bookmarks[commandName]);
							console.log("\nExecuting command " + chalk.yellow.bold(commandName) + ": " + chalk.italic(bookmarks[commandName]) + "\n");
	
							exit();
						}
						break;
		
					case GUI_MODE_DELETE:
						selectedForDeletion = parseInt(current) == NaN ? -1 : parseInt(current);

						if (selectedForDeletion > 0 && selectedForDeletion <= Object.keys(bookmarks).length) {
							current = "";
							guiMode = GUI_MODE_CONFIRM_DELETE;
							redrawGUI();
						}
						break;
		
					case GUI_MODE_CONFIRM_DELETE:
						fs.appendFileSync("/home/lars/debug.log", "current when confirm delete = " + selectedForDeletion + "\n");

						if (current != "no" && current != "n") {
							if (selectedForDeletion != -1) {
								fs.appendFileSync("/home/lars/debug.log", "number not -1\n");
	
								delete bookmarks[Object.keys(bookmarks)[selectedForDeletion - 1]];
								delete matches[Object.keys(matches)[selectedForDeletion - 1]];
	
								let data = JSON.stringify(bookmarks, null, 4);
								fs.writeFileSync(bookmarksFile, data);
							}
						}
	
						guiMode = GUI_MODE_DELETE;
						current = "";
						selectedForDeletion = -1;
						redrawGUI();
						break;

					default:
						break;
				}

				break;
						
			/* User input */
			default:
				if (guiMode == GUI_MODE_DELETE) {
					if (is_numeric(String.fromCharCode(charAsAscii))) {
						current += String.fromCharCode(charAsAscii);
					}
				} else if (guiMode == GUI_MODE_CONFIRM_DELETE) {
					current += String.fromCharCode(charAsAscii);
				} else if (guiMode == GUI_MODE_RUN) {
					current += String.fromCharCode(charAsAscii);
					findMatches();
				}

				redrawGUI();

				break;
		}
	});
}

/**
 * Keeps skipping forward in command names until next "conflict"
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
	numberOfVisibleRows = (current == "") ? Object.keys(bookmarks).length : 0;

	for (let key of Object.keys(bookmarks)) {
		if ( current != "" && key.toLowerCase().startsWith(current.toLowerCase()) ) {
			key.toLowerCase() == current.toLowerCase() ? matches[key] = 2 : matches[key] = 1;
			numberOfVisibleRows++;
		} else {
			matches[key] = 0;
		}
	}

	let maxTableRows = (terminalHeight() - 19) / 2 - 1;
	if (maxTableRows % 2 == 0) maxTableRows--;
	numberOfPages = Math.ceil(numberOfVisibleRows / maxTableRows);
	currentPage = 1;
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
	let maximumCommandWidth = fitToWidth ? 500 : LIST_MAXIMUM_COMMAND_WIDTH;
	let remainingWidth = terminalWidth() - LIST_NUMBER_COLUMN_WIDTH - nameColumnWidth - 7; // 7 = padding and borders
	let commandWidth = Math.max( Math.min(remainingWidth, maximumCommandWidth), 0 );

	/* Title and menu */
	let menuWidth = (" ^F Fit width " + " ^D Delete " + "^C/Esc Exit").length;
	let menu = chalk.bgAnsi256(215).black(" ^F ") + " Fit width " + chalk.bgAnsi256(215).black(" ^D ") + " Delete " + chalk.bgAnsi256(215).black(" ^C/Esc ") + " Exit";
	let tableWidth = nameColumnWidth + commandWidth + LIST_NUMBER_COLUMN_WIDTH + 2;

	if (menuWidth + LABEL_TITLE_WIDTH + 4 > terminalWidth()) process.stdout.write( "\n" );
	readline.cursorTo(process.stdout, tableWidth - menuWidth);
	process.stdout.write( menu );

	readline.cursorTo(process.stdout, 0);

	// process.stdout.write( tableBorder("─".repeat(LABEL_TITLE_WIDTH)) + "\n");
	cfonts.say('BLAST', {
		font: "block",
		colors: ["yellowBright", "#f80"],
		space: false,
	});

	process.stdout.write( "\n" + chalk.yellow.bold(LABEL_TITLE) );
	process.stdout.write( "\n\n" );

	/* Usage info */
	console.log( "\n" + chalk.yellow.bold(" Usage:") );
	console.log( usage(" blast as ") + chalk.blue("'bookmark-name'") + "     <- Save bookmark");
	console.log( usage(" blast ") + chalk.blue("'bookmark-name'") + "        <- Execute bookmarked command");
	console.log( usage(" blast delete ") + chalk.blue("'bookmark-name'") + " <- Delete bookmark" );
	console.log( usage(" blast show ") + chalk.blue("'bookmark-name'") + "   <- List bookmarks starting with specified string\n\n");

	/* Draw top border of table */
	process.stdout.write( tableBorder("╭────┬" + "─".repeat(nameColumnWidth + 2)) );
	process.stdout.write( tableBorder("┬" + "─".repeat(commandWidth + 2) + "╮\n") );

	let y = {};

	/* Find last matching name, for use later, to avoid to include divider after the final table row */
	let lastMatch = "";
	Object.keys(matches).forEach(function(value, index, array) {
		if (matches[value] == 1 || matches[value] == 2) {
			lastMatch = value;
		}
		if (matches[value] == 1 || matches[value] == 2 || current == "") {
			y[value] = matches[value];
		}
	});


	let maxTableRows = (terminalHeight() - 19) / 2 - 1;
	if (maxTableRows % 2 == 0) maxTableRows--;

	let from = (currentPage - 1) * maxTableRows + 1;
	let to = from + maxTableRows - 1;
	if (to > Object.keys(y).length) to = Object.keys(y).length;

	fs.appendFileSync("/home/lars/debug.log", "from = " + from + " / to = " + to + " / maxTableRows = " + maxTableRows + " / currentPage = " + currentPage + "\n");

	let z = {};

	Object.keys(y).forEach(function(value, index, array) {
		fs.appendFileSync("/home/lars/debug.log", "each y value when MAYBE included = " + value + " / index = " + index + "\n");
		if ( index+1 >= from && index+1 <= to) {
			// fs.appendFileSync("/home/lars/debug.log", "each y value when included = " + value + "\n");
			z[value] = matches[ Object.keys(y)[index] ];
		}
	});

	// Object.keys(z).forEach(function(value, index, array) {
	// 	fs.appendFileSync("/home/lars/debug.log", "key = " + value + " / state = " + bookmarks[value] + "\n");
	// });

	let lastName = Object.keys(z).pop();

	/* Draw line for each bookmark in table */
	for (let key of Object.keys(z)) {
		let commandName = key.padEnd(nameColumnWidth, " ");

		fs.appendFileSync("/home/lars/debug.log", "key = " + key + " / state = " + z[key] + "\n");

		/* "Chunk"ate command so it does'nt exceed command column width but wraps instead */
		/* If no space for command column, just show nothing */
		let chunks = new Array("");
		if (commandWidth > 0) chunks = chunkSubstring(bookmarks[key], commandWidth);

		switch (z[key]) {
			case 0:
				commandName = noMatch(commandName);
				break;

			case 1:
				commandName = match(commandName);
				break;

			case 2:
				exactMatch = key;
				commandName = matchUnique(commandName);
				break;
		}

		let numberColumn = (Object.keys(bookmarks).indexOf(key) + 1).toString().padStart(2, " ");

		/* Bookmark line */
		if (current == "" || z[key] == 1 || z[key] == 2) {
			process.stdout.write( tableBorder("│ ") + numberColumn + tableBorder(" │ ") );
			process.stdout.write( commandName + tableBorder(" │ ") + chunks[0].padEnd(commandWidth, " ") + tableBorder(" │\n") );

			if (chunks.length > 1) {
				chunks.slice(1).forEach(function(value, index, array) {
					process.stdout.write( tableBorder("│    │ ") );
					process.stdout.write( " ".repeat(nameColumnWidth) + tableBorder(" │ ") + value.padEnd(commandWidth, " ") + tableBorder(" │\n") );
				});
			}

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
		console.log(chalk.green("\nMatch found: press enter to execute command"));
		process.stdout.write(": " + current);
	} else {
		switch (guiMode) {
			case GUI_MODE_RUN:
				console.log(chalk.yellow("\nSpecify name of command to execute:"));
				process.stdout.write(chalk.reset(": " + current));
				break;

			case GUI_MODE_DELETE:
				console.log(chalk.yellow("\nSpecify number of command to delete and press enter:"));
				process.stdout.write(": " + current);
				break;

			case GUI_MODE_CONFIRM_DELETE:
				let nameOfCommandToDelete = Object.keys(bookmarks)[selectedForDeletion - 1];
				console.log(chalk.yellow("\nAbout to delete " + chalk.red(nameOfCommandToDelete) +  " are you sure?"));
	
				process.stdout.write("[yes]/no: " + current);
				break;
		}
	}
}

process.on('SIGWINCH', () => {
	let maxTableRows = (terminalHeight() - 19) / 2 - 1;
	if (maxTableRows % 2 == 1) maxTableRows--;
	numberOfPages = Math.ceil(numberOfVisibleRows / maxTableRows);
	currentPage = 1;

	// fs.appendFileSync("/home/lars/debug.log", "console resized || num matches = " + numberOfVisibleRows + " / maxTableRows = " + maxTableRows + " / numberOfPages = " + numberOfPages + "\n");

	redrawGUI();
});

function is_numeric(string) {
	return /^\d+$/.test(string);
}

function terminalWidth() {
	return process.stdout.getWindowSize()[0];
}

function terminalHeight() {
	return process.stdout.getWindowSize()[1];
}

function chunkSubstring(string, size) {
	const numChunks = Math.ceil(string.length / size)
	const chunks = new Array(numChunks)

	for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
		chunks[i] = string.substr(o, size)
	}

	return chunks
}


	
// for (let key of Object.keys(bookmarks)) {
// 	fs.appendFileSync("/home/lars/debug.log", "bookmarks after delete = " + bookmarks[key] + "\n");
// }
// for (let key of Object.keys(matches)) {
// 	fs.appendFileSync("/home/lars/debug.log", "matches after delete = " + matches[key] + "\n");
// }
