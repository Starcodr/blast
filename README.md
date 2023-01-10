# BLAST
Linux cli command for bookmarking latest command in history with accompanying GUI for browsing and managing bookmarks.

## Installation
```
Install the code from NPM repository:
$ npm install blarst
```
```
Register/install globally to run as executable command from anywhere:
$ sudo npm install -g blarst
```

#
## Usage
### Bookmark latest history entry
```
$ bin/console doctrine:migrations:migrate
(some doctrine output)
...etc
$ blast as migrate
Bookmark "migrate" created for:
bin/console doctrine:migrations:migrate
$ █
```
### Run bookmarked command
```
$ blast migrate
(some doctrine output)
...etc
$ █
```
### List bookmarks starting with specified string
```
$ blast show migrate

    Bookmark doctrine:
    bin/console doctrine:migrations:migrate

$ █
```
### List all bookmarks on command line
```
$ blast show $
```
### Delete bookmark
```
$ blast delete migrate
Deleting bookmark: doctrine
$ █
```

Run "blast" command without parameters to open GUI.  

The GUI shows a list of all bookmarked commands. Writing the name of the command and pressing enter executes the command.  

Tab completion on bookmark names is supported. Tab completion will also filter the list to show only the matching bookmarks.
#
## TODO
- Comment for bookmark
- Linewrapping of commands in list