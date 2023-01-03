mkdir -p $HOME/.config/blast
touch $HOME/.config/blast/bookmarks.json
touch $HOME/.config/blast/latest_history.txt
touch $HOME/.config/blast/command.sh
chmod +x $HOME/.config/blast/command.sh

mkdir -p $HOME/bin
cp bin/blast $HOME/bin
chmod +x $HOME/bin/blast

npm install
npm install -g .