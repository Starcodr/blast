#!/usr/bin/env node

const chalk = require("chalk");
const boxen = require("boxen");
const yargs = require("yargs");
const { exec } = require('child_process');
const fs = require('fs');
const readline = require('readline');
const { check, updateLocale } = require("yargs");
const { exit } = require("process");
var clear = require('clear');

const enterAltScreenCommand = '\x1b[?1049h';
const leaveAltScreenCommand = '\x1b[?1049l';
// process.on('exit', () => {
//     process.stdout.write(leaveAltScreenCommand);
// });

const bookmarksFile = '/home/lars/.config/blast/bookmarks.json';

var bookmarks = new Array();
var current = "";
var result = {};

const options = yargs
 .usage("Usage: -keyword <name>")
 .option("n", { alias: "name", describe: "name of bookmark", type: "string", demandOption: false })
 .option("h", { alias: "history", describe: "previous command", type: "string", demandOption: false })
 .option("a", { alias: "action", describe: "status: error or success", type: "string", demandOption: false })
 .argv;

if (options.action == "save") {
	if (options.history.startsWith("blast")) {
		console.log(chalk.red("Blasting blast is not sane...aborting!"));
		return;
	}

	console.log("Bookmarking last command: \n" + options.history);
	console.log("as" + chalk.yellow.bold(options.name));

	let rawdata = fs.readFileSync(bookmarksFile);
	let bookmarks = JSON.parse(rawdata);

	bookmarks[options.name] = options.history;

	let data = JSON.stringify(bookmarks, null, 4);

	if (!fs.existsSync(bookmarksFile)) {
		console.log("not exists");
	} else {
		fs.writeFileSync(bookmarksFile, data);
	}

} else if (options.action == "use") {
	let rawdata = fs.readFileSync(bookmarksFile);
	let bookmarks = JSON.parse(rawdata);

	const command = chalk.yellow.bold(bookmarks[options.name]);
	console.log("\n" + command);

	var rl = readline.createInterface(process.stdin, process.stdout);
	rl.question("Run this command? [yes]/no: ", function (answer) {
		if (answer == "no") {
			fs.writeFileSync("/home/lars/.config/blast/command.sh", "");

			console.log("Aborted");
			process.exit(1);
		}
		else {
			fs.writeFileSync("/home/lars/.config/blast/command.sh", bookmarks[options.name]);
			console.log("Running command...\n");

			rl.close();
			return;
		}
	});//question()
} else if (options.action = "showall") {
	process.stdout.write(enterAltScreenCommand);
	// process.stdout.write('\x1Bc');

	if (!fs.existsSync(bookmarksFile)) {
		fs.writeFileSync("/home/lars/.config/blast/command.sh", "");
		console.log("not exists");
	} else {
		let rawdata = fs.readFileSync(bookmarksFile);
		bookmarks = JSON.parse(rawdata);

		autoComplete();
	}
} else {
	console.log("Error: " + options.status);
}

function autoComplete() {
	update();

	process.stdin.currentLine = '';
	process.stdin.setRawMode(true);

	var listener = process.stdin.on('data', this.eventListener = (buf) => {
		const charAsAscii = buf.toString().charCodeAt(0);

		// console.log(charAsAscii);

		switch (charAsAscii) {
			case 38:
				clear();
				break;

			case 0x03:
				fs.writeFileSync("/home/lars/.config/blast/command.sh", "");
				process.stdout.write(leaveAltScreenCommand);
				console.log('Exiting..');
				process.kill(process.pid, 'SIGINT');
				break;

			case 27:
				fs.writeFileSync("/home/lars/.config/blast/command.sh", "");
				process.stdout.write(leaveAltScreenCommand);
				console.log('Exiting..');
				process.kill(process.pid, 'SIGINT');
				break;
	
			case 127:
				current = current.slice(0, -1);
				update();
				break;

			case 0x09:
				update();
				break;

			case 13:
				process.stdout.write(leaveAltScreenCommand);

				let keys = Object.keys(result);
				if (keys.length == 1) {
					console.log("\nRunning command " + chalk.yellow.bold(keys[0]) + ": " + chalk.green(bookmarks[keys[0]]) + "\n");

					fs.writeFileSync("/home/lars/.config/blast/command.sh", bookmarks[keys[0]]);

					exit();
				}

				break;

			default:
				current += String.fromCharCode(charAsAscii);
				update();
				break;
		}
	});

	// process.stdin.on('line', line => console.log(`New line: ${line}`));
}

function update() {
	result = {};

	const match = chalk.yellow.bold;
	const noMatch = chalk.white;
	const tableBorder = chalk.white;

	readline.cursorTo(process.stdout, 0, 0);
	readline.clearScreenDown(process.stdout);
	// clear();

	// ╭───────┬────────────────────╮
	// │ splif │ cat some dims more │
	// ├───────┼────────────────────┤
	// │       │                    │
	// ├───────┼────────────────────┤
	// │       │                    │
	// ├───────┼────────────────────┤
	// │       │                    │
	// ╰───────┴────────────────────╯

	let maxKeyLength = 0;
	for (let key of Object.keys(bookmarks)) {
		maxKeyLength = Math.max(key.length, maxKeyLength);
	}

	maxKeyLength = Math.max(maxKeyLength, 25);

	console.log( match("Press ctrl-c to exit\n") );

	process.stdout.write( tableBorder("╭") );
	process.stdout.write( tableBorder("─".repeat(maxKeyLength + 2)) );
	process.stdout.write( tableBorder("┬") );
	process.stdout.write( tableBorder("─".repeat(100)) );
	process.stdout.write( tableBorder("╮\n") );

	for (let key of Object.keys(bookmarks)) {
		let commandAlias = "";
		let command = "";

		if ( current != "" && key.toLowerCase().startsWith(current.toLowerCase()) ) {
			result[key] = bookmarks[key];
			commandAlias = match(key.padEnd(maxKeyLength, " "));
			command = match(bookmarks[key].padEnd(98, " "));
		} else {
			commandAlias = noMatch(key.padEnd(maxKeyLength, " "));
			command = noMatch(bookmarks[key].padEnd(98, " "));
		}

		// let command = chalk.yellow.bold(key + " = " + bookmarks[key]);
		process.stdout.write( tableBorder("│ ") );
		process.stdout.write(commandAlias);
		process.stdout.write( tableBorder(" │ ") );
		process.stdout.write(command);
		process.stdout.write(" │\n");

		process.stdout.write( tableBorder("│") );
		process.stdout.write( tableBorder("╌".repeat(maxKeyLength + 2)) );
		process.stdout.write( tableBorder("┼") );
		process.stdout.write( tableBorder("╌".repeat(100)) );
		process.stdout.write( tableBorder("│\n") );
	
	}

		// ╰───────┴────────────────────╯

	process.stdout.write( tableBorder("╰") );
	process.stdout.write( tableBorder("─".repeat(maxKeyLength + 2)) );
	process.stdout.write( tableBorder("┴") );
	process.stdout.write( tableBorder("─".repeat(100)) );
	process.stdout.write( tableBorder("╯\n") );

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

// console.log("name: " + options.name);
// console.log("history: " + options.history);

// console.dir(process.argv[2]);

// process.argv.forEach(function (val, index, array) {
// 	console.log(index + ': ' + val);
//   });
   
// const execSync = require('child_process').execSync;
// code = execSync('history | tail -n 2 | cut -c 8-');

// console.log(code.toString());

// console.log(sh.ls('-l'));

// exec("history | tail -n 2 | cut -c 8-", (error, stdout, stderr) => {
//     if (error) {
//         console.log(`error: ${error.message}`);
//         return;
//     }
//     if (stderr) {
//         console.log(`stderr: ${stderr}`);
//         return;
//     }
//     console.log(`stdout: ${stdout}`);
// });

// const greeting = chalk.white.bold("Hello!");


// const boxenOptions = {
//  padding: 1,
//  margin: 1,
//  borderStyle: "round",
//  borderColor: "green",
//  backgroundColor: "#555555"
// };
// const msgBox = boxen( greeting, boxenOptions );

// console.log(msgBox);