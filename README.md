# BLAST
Linux cli command for bookmarking latest command in history.

## Installation
```
$ mkdir ~/.config/blast
$ touch ~/.config/blast/bookmarks.json
$ touch ~/.config/blast/latest_history.txt
$ touch ~/.config/blast/command.sh
$ chmod ~/.config/blast/command.sh +x

$ add /home/"user"/bin to $PATH
$ cp bin/blast ~/bin
$ chmod ~/bin/blast +x

$ npm install
$ npm install -g .
```

## Usage
```
$ bin/console doctrine:migrations:migrate
.
.
$ blast as migrate
Bookmark "migrate" created for:
bin/console doctrine:migrations:migrate

$ blast migrate
.
.
$ █
```
Run "blast" command without parameters to open GUI.  
The GUI list all bookmarked commands. Writing the name of the command and pressing enter executed the command.
#
## TODO
Simplify install process.