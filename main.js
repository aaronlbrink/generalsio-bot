'use strict';

const iMov = require('./imov');

// 0 - custom 1 - 1v1 2 - free for all
const gameType = 0;

const fs = require('fs');
const io = require('socket.io-client');
const mkdirp = require('mkdirp');
const path = require('path');
const rimraf = require('rimraf');
const socket = io('http://botws.generals.io');

const user_id = 'ANFgz=R+egCnCqFwjqz7';
const username = '[Bot] Archie';

const randInt = function (min, max) {
    return Math.floor(Math.random() * (max+1 - min) + min);
}

socket.on('disconnect', function() {
	console.error('Disconnected from server.');
	process.exit(1);
});

socket.on('connect', function() {
	console.log('Connected to server.');

	/* Don't lose this user_id or let other people see it!
	 * Anyone with your user_id can play on your bot's account and pretend to be your bot.
	 * If you plan on open sourcing your bot's code (which we strongly support), we recommend
	 * replacing this line with something that instead supplies the user_id via an environment variable, e.g.
	 * var user_id = process.env.BOT_USER_ID;
	 */


	// Set the username for the bot.
	// This should only ever be done once. See the API reference for more details.
	socket.emit('set_username', user_id, username);

    startGame();

});


const startGame = function () {
    // Join a custom game and force start immediately.
	// Custom games are a great way to test your bot while you develop it because you can play against your bot!
    if (gameType == 0) {
        var custom_game_id = 'archie';
        socket.emit('join_private', custom_game_id, user_id);
        socket.emit('set_force_start', custom_game_id, true);
        console.log('Joined custom game at http://bot.generals.io/games/' + encodeURIComponent(custom_game_id));
    }
	// When you're ready, you can have your bot join other game modes.
	// Here are some examples of how you'd do that:

	// Join the 1v1 queue.
    if (gameType == 1) {
        console.log('Joining 1 v 1');
        socket.emit('join_1v1', user_id);
    }

	// Join the FFA queue.
    if (gameType == 2) {
        console.log('Joining FFA');
	   socket.emit('play', user_id);
    }

	// Join a 2v2 team.
	//socket.emit('join_team', 'team_name', user_id);
}


/* Returns a new array created by patching the diff into the old array.
 * The diff formatted with alternating matching and mismatching segments:
 * <Number of matching elements>
 * <Number of mismatching elements>
 * <The mismatching elements>
 * ... repeated until the end of diff.
 * Example 1: patching a diff of [1, 1, 3] onto [0, 0] yields [0, 3].
 * Example 2: patching a diff of [0, 1, 2, 1] onto [0, 0] yields [2, 0].
 */
function patch(old, diff) {
	var out = [];
	var i = 0;
	while (i < diff.length) {
		if (diff[i]) {  // matching
			Array.prototype.push.apply(out, old.slice(out.length, out.length + diff[i]));
		}
		i++;
		if (i < diff.length && diff[i]) {  // mismatching
			Array.prototype.push.apply(out, diff.slice(i + 1, i + 1 + diff[i]));
			i += diff[i];
		}
		i++;
	}
	return out;
}

let replay_url = '';

var lastGameStartMessage;
var botMove;
var lastStartDate;
socket.on('game_start', function(data) {
    lastGameStartMessage = data;
	// Get ready to start playing the game.
    // homeDefenseRadius, bozoFrameCountThing, startWait, pastIndicesMax

    botMove = new iMov(socket, data.playerIndex);
                         // homeDefenseRadius, bozoFrameCountThing, startWait, pastIndicesMax
	replay_url = 'http://bot.generals.io/replays/' + encodeURIComponent(data.replay_id);
	console.log('Game starting! The replay will be available after the game at ' + replay_url);
});


// --------------------------------------------------------------------------

// Game data.
var cities = []; // The indicies of cities we have vision of.
var map = [];
socket.on('game_update', function(data) {
	// Patch the city and map diffs into our local variables.
	cities = patch(cities, data.cities_diff);
	map = patch(map, data.map_diff);

	// The first two terms in |map| are the dimensions.
	var width = map[0];
	var height = map[1];
	var size = width * height;

	// The next |size| terms are army values.
	// armies[0] is the top-left corner of the map.
	var armies = map.slice(2, size + 2);

	// The last |size| terms are terrain values.
	// terrain[0] is the top-left corner of the map.
	var terrain = map.slice(size + 2, size + 2 + size);

    botMove.update(cities, data.generals, width, height, size, armies, terrain);

    console.log(replay_url);
});

function leaveGame(outcome) {
    if (outcome == 1) {
        console.log('I WON THE GAME');
    } else {
        console.log('I LOST THE GAME');
    }
    storeData(outcome);

	socket.emit('leave_game');
    startGame();
}

socket.on('game_lost', () => leaveGame(0));

socket.on('game_won', () => leaveGame(1));

function storeData(outcome) {
    // TODO put stuff in txt file
}
