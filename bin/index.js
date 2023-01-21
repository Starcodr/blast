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
const ansi = require('ansi');

let cursor = ansi(process.stdout);
var eventEmitter = null;

var bookmarks = new Array();
var settings = new Array();
var current = "";
var matches = {};
var selectedForDeletion = -1;

const GUI_MODE_RUN = 1;
const GUI_MODE_DELETE = 2;
const GUI_MODE_CONFIRM_DELETE = 3;
const GUI_MODE_SETTINGS = 4;

var guiMode = 1;
var fitToWidth = false;
var currentPage = 1;
var numberOfPages = 1;
var numberOfVisibleRows = 0;

const LIST_MINIMUM_NAME_WIDTH = 25;
const LIST_MAXIMUM_COMMAND_WIDTH = 90;
const LABEL_TITLE = " Bookmark management interface";
const LABEL_TITLE_WIDTH = LABEL_TITLE.length;
const LIST_NUMBER_COLUMN_WIDTH = 6;

/* ASCII codes for entering or leaving full screen mode */
const enterAltScreenCommand = '\x1b[?1049h';
const leaveAltScreenCommand = '\x1b[?1049l';

/* Path to file containing bookmarks etc. */
const bookmarksFile = os.homedir() + "/.config/blast/bookmarks.json";
const commandFile = os.homedir() + "/.config/blast/command.sh";
const completionFile = os.homedir() + "/.config/blast/completion.sh";

/* Possible cli input parameters */
const options = yargs
 .usage("Usage: -keyword <name>")
 .option("n", { alias: "name", describe: "name of bookmark", type: "string", demandOption: false })
 .option("h", { alias: "history", describe: "previous command", type: "string", demandOption: false })
 .option("a", { alias: "action", describe: "status: error or success", type: "string", demandOption: false })
 .argv;

/* Create required files if they do not exist */
if (!fs.existsSync(bookmarksFile)) {
	let json = JSON.stringify(defaultBookmarksData(), null, 4);
	fs.writeFile(bookmarksFile, json, function (err) {});
}

if (!fs.existsSync(commandFile)) {
	fs.writeFile(commandFile, "", function (err) {});
}

if (!fs.existsSync(completionFile)) {
	fs.writeFile(completionFile, "", function (err) {});
}

/* Make sure no command is run unintentionally */
fs.writeFileSync(commandFile, "");

/* Fetch existing bookmarks */
let rawdata = fs.readFileSync(bookmarksFile);

try {
	let data = JSON.parse(rawdata);
	bookmarks = data.bookmarks;
	settings = data.settings;
	fitToWidth = settings.fitToWidth;

	/* Remove empty commands if any should exist by mistake */
	for (let key of Object.keys(bookmarks)) {
		if (bookmarks[key].trim() == "") {
			delete bookmarks[key];
		}
	}
} catch(error) {
	let data = defaultBookmarksData();
	bookmarks = data.bookmarks;
	settings = data.settings;

	writeBookmarksFile();
}

options.name = options.name.trim();
options.action = options.action.trim().toLowerCase();

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
		write(enterAltScreenCommand); // Enter fullscreen
		findMatches();
		redrawGUI();

		process.stdin.currentLine = '';
		process.stdin.setRawMode(true);
	
		process.stdin.on('data', buf => keyboardListener(buf));
	
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
		writeBookmarksFile();
	}

	if (options.name in bookmarks) {
		/* Have user confirm overwrite */
		let rl = readline.createInterface(process.stdin, process.stdout);
		rl.question("A bookmark with this name already exists. Replace? [yes]/no: ", function (answer) {
			if (answer.toLowerCase() == "no" || answer.toLowerCase() == "n") {
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
		writeBookmarksFile();

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
				write("\n");
			}

			write("    Bookmark " + chalk.yellow.bold(key + ": "));
			console.log(chalk.italic(bookmarks[key]));
		}
	}

	if (found == 0) {
		console.log("\n    " + chalk.red("No bookmarks found matching: ") + chalk.yellow.bold(options.name));
	}

	write("\n");
}

/**
 * Run the choosen command
 */
function useBookmark() {
	if (options.name in bookmarks) {
		const command = chalk.green.bold(bookmarks[options.name]);
		console.log("\n" + command);

		/* Have user confirm */
		if (settings.confirmCommandLine) {
			let rl = readline.createInterface(process.stdin, process.stdout);
			rl.question("Execute this command? [yes]/no: ", function (answer) {
				if (answer.toLowerCase() == "no" || answer.toLowerCase() == "n") {
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
			console.log("Executing command...\n");

			fs.writeFileSync(commandFile, bookmarks[options.name]);
			return;
		}
	} else {
		console.log("\n    " + chalk.red("No bookmark found matching: ") + chalk.yellow.bold(options.name) + "\n");
	}
}

/**
 * Handle user GUI interaction
 */
function keyboardListener(buf) {
	if (guiMode == GUI_MODE_SETTINGS) {
		settingsKeyboardListener(buf);
	} else {
		mainKeyboardListener(buf);
	}
}

function mainKeyboardListener(buf) {
	const charAsAscii = buf.toString().charCodeAt(0);

	// fs.appendFileSync("/home/x/debug.log", "char code = " + charAsAscii + "\n");

	if (buf == '\u001B\u005B\u0041') { // Up
		if (currentPage > 1) currentPage--;
		redrawGUI();

		return;
	}

	if (buf == '\u001B\u005B\u0042') { // Down
		if (currentPage < numberOfPages) currentPage++;
		redrawGUI();

		return;
	}

	if (buf == '\u001B\u005B\u0044') { // Left
		return;
	}

	if (buf == '\u001B\u005B\u0043') { // Right
		return;
	}

	switch (charAsAscii) {
		case 38:
			clear();
			break;

		/* Ctrl-c */
		case 0x03:
			console.log('Exiting..');

			cursor.show();
			write(leaveAltScreenCommand);
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

		/* Ctrl-s */
		case 0x13:
			guiMode = GUI_MODE_SETTINGS;
			cursor.hide();
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

			cursor.show();
			write(leaveAltScreenCommand);
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

						write(leaveAltScreenCommand);
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
					if (current.toLowerCase() != "no" && current.toLowerCase() != "n") {
						if (selectedForDeletion != -1) {
							delete bookmarks[Object.keys(bookmarks)[selectedForDeletion - 1]];
							delete matches[Object.keys(matches)[selectedForDeletion - 1]];

							writeBookmarksFile();
						}
					}

					guiMode = GUI_MODE_DELETE;
					current = "";
					selectedForDeletion = -1;
					redrawGUI();

					break;
			}

			break;
					
		/* User input */
		default:
			switch (guiMode) {
				case GUI_MODE_DELETE:
					if (is_numeric(String.fromCharCode(charAsAscii))) {
						current += String.fromCharCode(charAsAscii);
					}
					break;

				case GUI_MODE_CONFIRM_DELETE:
					current += String.fromCharCode(charAsAscii);
					break;

				case GUI_MODE_RUN:
					current += String.fromCharCode(charAsAscii);
					findMatches();
					break;
			}

			redrawGUI();
			break;
	}
}

function settingsKeyboardListener(buf) {
	const charAsAscii = buf.toString().charCodeAt(0);

	switch (charAsAscii) {
		case 38:
			clear();
			break;

		/* 1 (toggle usage info) */
		case 49:
			settings.showUsageInfo = !settings.showUsageInfo;
			writeBookmarksFile();
			redrawGUI();
			break;

		/* 2 (toggle large logo) */
		case 50:
			settings.showLargeLogo = !settings.showLargeLogo;
			writeBookmarksFile();
			redrawGUI();
			break;

		/* 3 (toggle confirm on command line) */
		case 51:
			settings.confirmCommandLine = !settings.confirmCommandLine;
			writeBookmarksFile();
			redrawGUI();
			break;

		/* 4 (toggle fit to width) */
		case 52:
			settings.fitToWidth = !settings.fitToWidth;
			writeBookmarksFile();
			redrawGUI();
			break;

		/* e (export bookmarks) */
		case 101:
			/* not implemented */
			break;

		/* Ctrl-c */
		case 0x03:
			console.log('Exiting..');

			cursor.show();
			write(leaveAltScreenCommand);
			process.kill(process.pid, 'SIGINT');
			break;

		/* Esc */
		case 27:
			if (guiMode != GUI_MODE_RUN) {
				guiMode = GUI_MODE_RUN;
				cursor.show();
				redrawGUI();
				break;
			}

			console.log('Exiting..');

			write(leaveAltScreenCommand);
			process.kill(process.pid, 'SIGINT');
			break;
		
		/* Backspace */
		case 127:
			redrawGUI();
			break;
					
		/* User input */
		default:
			// if (guiMode == GUI_MODE_SETTINGS) {
			// 	if (is_numeric(String.fromCharCode(charAsAscii))) {
			// 		fs.appendFileSync("/home/lars/debug.log", "settings value = " + charAsAscii + "\n");
			// 	}
			// }

			// redrawGUI();
			break;
	}
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
	if (guiMode == GUI_MODE_SETTINGS) {
		redrawSettingsGUI();
		return;
	}

	exactMatch = "";

	const match = chalk.white;
	const matchUnique = chalk.green;
	const noMatch = chalk.white;
	const tableBorder = chalk.white;
	const usage = chalk.white;
	const menuStyle = chalk.bgAnsi256(215).black;

	/* Prepare/clear screen */
	readline.cursorTo(process.stdout, 0, 0);
	readline.clearScreenDown(process.stdout); // write("\x1Bc")
	readline.cursorTo(process.stdout, 0, terminalHeight());

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

	/* Menu */
	let menuWidth = (` ^F Fit width  ^D Delete  ^S Settings ^C/Esc Exit`).length;
	let menu = menuStyle(" ^F ") + " Fit width "
			 + menuStyle(" ^D ") + " Delete "
			 + menuStyle(" ^S ") + " Settings "
			 + menuStyle(" ^C/Esc ") + " Exit";

	let tableWidth = nameColumnWidth + commandWidth + LIST_NUMBER_COLUMN_WIDTH + 2;

	if (menuWidth + LABEL_TITLE_WIDTH + 4 > terminalWidth()) write( "\n" );
	readline.cursorTo(process.stdout, tableWidth - menuWidth);
	write( menu );

	readline.cursorTo(process.stdout, 0);

	/* Title */
	if (settings.showLargeLogo) {
		cfonts.say('BLAST', {
			font: "block",
			colors: ["yellowBright", "#f80"],
			space: false,
		});
		write( "\n" + chalk.yellow.bold(LABEL_TITLE) );
	} else {
		write( chalk.yellow.bold(" BLAST - " + LABEL_TITLE) );
	}
	write( "\n\n" );

	/* Usage info */
	if (settings.showUsageInfo) {
		console.log( chalk.yellow.bold(" Usage:") );
		console.log( usage(" blast as ") + chalk.blue("'bookmark-name'") + "     <- Save bookmark");
		console.log( usage(" blast ") + chalk.blue("'bookmark-name'") + "        <- Execute bookmarked command");
		console.log( usage(" blast delete ") + chalk.blue("'bookmark-name'") + " <- Delete bookmark" );
		console.log( usage(" blast show ") + chalk.blue("'bookmark-name'") + "   <- List bookmarks starting with specified string ($ shows all bookmarks)\n");
		console.log( " To enable autocompletion on commandline, remember to source ~/.config/blast/completion.sh in your bashrc file.\n" );
	}

	/* Draw top border of table */
	write( tableBorder("╭" + "─".repeat(5) + "┬" + "─".repeat(nameColumnWidth + 2)) );
	write( tableBorder("┬" + "─".repeat(commandWidth + 2) + "╮\n") );

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

	let z = {};

	Object.keys(y).forEach(function(value, index, array) {
		if ( index+1 >= from && index+1 <= to) {
			z[value] = matches[ Object.keys(y)[index] ];
		}
	});

	let lastName = Object.keys(z).pop();

	/* Draw line for each bookmark in table */
	for (let key of Object.keys(z)) {
		let commandName = key.padEnd(nameColumnWidth, " ");

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

		let numberColumn = (Object.keys(bookmarks).indexOf(key) + 1).toString().padStart(3, " ");

		/* Bookmark line */
		if (current == "" || z[key] == 1 || z[key] == 2) {
			write( tableBorder("│ ") + numberColumn + tableBorder(" │ ") );
			write( commandName + tableBorder(" │ ") + chunks[0].padEnd(commandWidth, " ") + tableBorder(" │\n") );

			/* Linewrap feature fubar. Max allowed table rows depends on commands line-wrapped or not. Implement later. */
			// if (chunks.length > 1) {
			// 	chunks.slice(1).forEach(function(value, index, array) {
			// 		write( tableBorder("│    │ ") );
			// 		write( " ".repeat(nameColumnWidth) + tableBorder(" │ ") + value.padEnd(commandWidth, " ") + tableBorder(" │\n") );
			// 	});
			// }

			/* Draw divider, but omit if this key is last in the list of matching names */
			if (key != lastMatch && lastName != key) {
				write( tableBorder("│" + "╌".repeat(5) + "┼" + "╌".repeat(nameColumnWidth + 2)) );
				write( tableBorder("┼" + "╌".repeat(commandWidth + 2) + "│\n") );
			}
		}
	}
		
	/* Draw bottom border of table */
	write( tableBorder("╰" + "─".repeat(5) + "┴" + "─".repeat(nameColumnWidth + 2)) );
	write( tableBorder("┴" + "─".repeat(commandWidth + 2) + "╯\n") );

	/* Update input line */
	if (guiMode == GUI_MODE_SETTINGS) {
		return;
	}

	if (exactMatch != "") {
		let command = bookmarks[exactMatch]
		console.log(chalk.green("\nMatch found: press enter to execute command"));
		write(": " + current);
	} else {
		switch (guiMode) {
			case GUI_MODE_RUN:
				console.log(chalk.yellow("\nSpecify name of command to execute:"));
				write(chalk.reset(": " + current));
				break;

			case GUI_MODE_DELETE:
				console.log(chalk.yellow("\nSpecify number of command to delete and press enter:"));
				write(": " + current);
				break;

			case GUI_MODE_CONFIRM_DELETE:
				let nameOfCommandToDelete = Object.keys(bookmarks)[selectedForDeletion - 1];
				console.log(chalk.yellow("\nAbout to delete " + chalk.red(nameOfCommandToDelete) +  " are you sure?"));
	
				write("[yes]/no: " + current);
				break;
		}
	}
}

function redrawSettingsGUI() {
	const tableBorder = chalk.white;

	/* Prepare/clear screen */
	readline.cursorTo(process.stdout, 0, 0);
	readline.clearScreenDown(process.stdout); // write("\x1Bc")

	readline.cursorTo(process.stdout, 0, terminalHeight() / 2 - 8);

	cfonts.say('SETTINGS', {
		font: "block",
		colors: ["yellowBright", "#f80"],
		transitionGradient: true,
		gradient: ['#ffaa00', '#cc7700'],
		space: false,
		align: "center"
	});

	let offset = terminalWidth() / 2 - 18;
	let usageInfo = settings.showUsageInfo ? "✓" : " ";
	let largeLogo = settings.showLargeLogo ? "✓" : " ";
	let confirmCLI = settings.confirmCommandLine ? "✓" : " ";
	let fitWidth = settings.fitToWidth ? "✓" : " ";

	write( "\n\n" );
	write( " ".repeat(offset) + tableBorder("╭─────── Press key to select ──────╮\n") );
	write( " ".repeat(offset) + tableBorder("│                                  │\n") );
	write( " ".repeat(offset) + tableBorder("│  1 | Show usage info        [" + usageInfo + "]  │\n") );
	write( " ".repeat(offset) + tableBorder("│  2 | Show large logo        [" + largeLogo + "]  │\n") );
	write( " ".repeat(offset) + tableBorder("│  3 | Confirm command line   [" + confirmCLI + "]  │\n") );
	write( " ".repeat(offset) + tableBorder("│  4 | Fit width on startup   [" + fitWidth + "]  │\n") );
	write( " ".repeat(offset) + tableBorder("│                                  │\n") );
	write( " ".repeat(offset) + tableBorder("│  e | Export bookmarks            │\n") );
	write( " ".repeat(offset) + tableBorder("│                                  │\n") );
	write( " ".repeat(offset) + tableBorder("╰──────────────────────────────────╯\n") );
	write( "\n" );

	write( " ".repeat(terminalWidth() / 2 - 18) + "(esc) exit settings" );
}

process.on('SIGWINCH', () => {
	let maxTableRows = (terminalHeight() - 19) / 2 - 1;
	if (maxTableRows % 2 == 1) maxTableRows--;
	numberOfPages = Math.ceil(numberOfVisibleRows / maxTableRows);
	currentPage = 1;

	redrawGUI();
});

function write(text) {
	process.stdout.write(text);
}

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

function defaultBookmarksData() {
	return {
		settings: {
			showUsageInfo: true,
			showLargeLogo: true,
			confirmCommandLine: true,
			fitToWidth: false
		},
		bookmarks: {}
	};
}

function writeBookmarksFile() {
	let json = JSON.stringify(
		{
			settings: settings,
			bookmarks:
				Object.fromEntries(Object.entries(bookmarks).sort(
					(a, b) => a[0].localeCompare(b[0])
				))
		}
		, null, 4
	);

	let names = "";
	for (let name of Object.keys(bookmarks)) {
		names += name + " ";
	}
	let completion = '#/usr/bin/env bash\ncomplete -W "' + names.trim() + '" blast';

	fs.writeFileSync(completionFile, completion);
	fs.writeFileSync(bookmarksFile, json);
}
