'use strict';



// Terrain Constants.
// Any tile with a nonnegative value is owned by the player corresponding to its value.
// For example, a tile with value 1 is owned by the player with playerIndex = 1.
const TILE_EMPTY = -1;
const TILE_MOUNTAIN = -2;
const TILE_FOG = -3;
const TILE_FOG_OBSTACLE = -4; // Cities and Mountains show up as Obstacles in the fog of war.

const iterableFirst = function (iterable, test) {
    for (const element of iterable) {
        if (test(element)) {
            return element;
        }
    }
}

//const homeDefenseRadius = 8;
//const bozoFrameCountThing = 10;


module.exports =
// --------------------------------- IMOV
class theBot {
    constructor (socket, playerIndex) {
        this.socket = socket;
        this.generals = new Map();
        this.generalIndices = new Set();
        this.mountains = new Set();
        this.playerIndex = playerIndex;
    }

    update (cities, generals, width, height, size, armies, terrain) {
        // update map variable
        this.cities = cities;
        this.width = width;
        this.height = height
        this.size = size;
        // Given map index tells you the count of armies (possibly enemy's) at
        // that location on the map.
        this.armies = armies;
        // Given a map index, tells you what is on that terrain: any nonnegative
        // number is an immobile gaia thing (TILE_EMPTY, TILE_MOUNTAIN,
        // TILE_FOG, TILE_FOG_OBSTACLE). Otherwise, if it owned by a player,
        // this is set to the player's index. E.g., 0 for the first player, etc.,
        // or maybe this.playerIndex for something owned by you.
        this.terrain = terrain;
        this.addGenerals(generals);
        terrain.forEach((t, i) => {
            if (t === TILE_MOUNTAIN) {
                this.mountains.add(i);
            }
        });
        this.myGeneral = this.generals.get(this.playerIndex);

        const goToZero = true;
        if (goToZero) {
          const maxArmyIndex = this.getMaxArmyIndex();
          const move = this.getShortestMoveToPosition(maxArmyIndex, 0);
          if (move !== undefined) {
            console.log('able to go to zero!');
            this.attack(maxArmyIndex, move);
            return;
          }
        }

        const maxArmyIndex = this.getMaxArmyIndex();
        const possibleMoves = this.getNeighbors(maxArmyIndex).filter(i => {
          return this.checkMoveable(i);
        });
        const move = possibleMoves[Math.random(possibleMoves.length) * possibleMoves.length|0];
        if (move !== undefined) {
          console.log('there are', this.armies[move], 'armies where I am going');

          this.attack(maxArmyIndex, move);
        }
    }

    attack(from, to) {
        // move to index
        console.log('attack', this.getCoordString(from), this.getCoordString(to));
        this.socket.emit('attack', from, to);
    }

    addGenerals(generals) {
        generals.forEach((general, i) => {
            if (general != -1) {
                this.generals.set(i, general);
                this.generalIndices.add(general);
            }
        });
        for (const generalEntry in this.generals.entries()) {
            const generalPlayerIndex = generalEntry[0];
            const general = generalEntry[1];
            if (general === -1) {
                // Skip undiscovered general.
                continue;
            }
            // Skip currently-invisible or non-player locations.
            if (this.terrain[general] < 0) {
                continue;
            }
            // If a tile transitioned away from being a general, remove it from our
            // memory as being a general.
            if (this.terrain[general] !== generalPlayerIndex) {
                this.generals.delete(generalPlayerIndex);
                this.generalIndices.delete(general);
            }
        }
    }

    getNeighbors(i) {
        return [
            i + 1,
            i - 1,
            i + this.width,
            i - this.width,
        ].filter(potentialNeighbor => this.checkInsideMap(i, potentialNeighbor));
    }


    getMaxArmyIndex () {
        let arr = this.armies;
        if (arr.length === 0) {
            return -1;
        }
        var max = arr[0];
        var maxIndex = 0;

        for (var i = 1; i < arr.length; i++) {
            if (arr[i] > max && this.terrain[i] === this.playerIndex) {
                maxIndex = i;
                max = arr[i];
            }
        }
        this.armySize = max;
        return maxIndex;
    }

    checkMoveable(to) {
        return this.checkCityTakeable(to)
        && !this.isMountain(to);
    }

    checkInsideMap(from, to) {
        // TODO. This is done very wrong. Redo this!

        // check if goes over
        const fromRow = this.getRow(from);
        const toRow = this.getRow(to);

        if (Math.abs(from-to) == 1) {
            // console.log('toRow from Row', toRow, fromRow);
            return toRow == fromRow;
        }
        if (Math.abs(from-to) == this.width) {
            // console.log('movCol, height', toRow, this.height);
            return toRow >= 0 && toRow < this.height;
        }
        throw new Error(`Assertion that ${to} (${this.getCoordString(to)}) is a neighbor of ${from} (${this.getCoordString(from)}) failed (fromRow=${fromRow}, toRow=${toRow})`);
    }

    checkCityTakeable (index) {


        for (let city of this.cities) {

            // Check if army big enough to take city
            if (city != index) {
                continue;
            }

            // If city not owned attack it no matter the cost
            if (this.terrain[index] < 0) {
                return this.armySize - 4 > this.armies[city];
            }
        }

        return true;
    }

    isMountain (index) {
        //console.log('terrain', this.terrain);
        //console.log('terrrrrrrrrrrrrrrrrrrrrrr', this.terrain[index]);
        return this.mountains.has(index);
    }

    getCol (index) {
        return index % this.width;
    }

    getRow (index) {
        // console.log('getRow', index/this.width);
        return Math.floor(index/this.width);
    }

    getCoordString(index) {
        return `(${this.getCol(index)}, ${this.getRow(index)})`;
    }

    /**
     * Get the move you should make to move the army at
     */
    getShortestMoveToPosition(from, to) {
      const path = this.shortestPath(from, index => to === index);
      if (path) {
        return path[0];
      }
    }

    /**
     * Returns an array indicating the positions to move to to get to b.
     * Excludes a and includes b. If there is no path between these locations
     * or b is otherwise inaccessible, returns null.
     *
     * isTarget: function(index, distance): returns true if the passed index is the target.
     *
     * options:
     * - test function (a, b): returns true if the move is allowed. Defaults to checking checkMoveable
     * - visit function (i, distance): passed an index and its distance from a. Called for a.
     */
    shortestPath(a, testTarget, options) {
        options = Object.assign({
            test: (from, to) => this.checkMoveable(from, to),
            visit: (i, distance) => {},
        }, options);
        if (testTarget(a)) {
            options.visit(a, 0);
            return [];
        }

        const pathArray = new Array(this.terrain.length);
        // Mark your original location as -1.
        pathArray[a] = -1; // -1 means source
        // Initialize queue to contain the initial node.
        const nextQ = [{ index: a, distance: 0, }];

        // While there are things in the Q, process it.
        while (nextQ.length) {
            const visiting = nextQ.shift();
            options.visit(visiting.index, visiting.distance);

            // Check if what we're visiting is the target.
            if (testTarget(visiting.index, visiting.distance)) {
                // We found the target! Trace back to origin!
                const path = [];
                for (let previous = visiting.index; previous !== -1; previous = pathArray[previous]) {
                    path.unshift(previous);
                }
                // Remove a from the path.
                path.shift();
                console.log('found path', path);
                return path;
            }

            // Mark all unvisited visitable neighbors of this node
            // as being most quickly accessed through the node we're
            // visiting. Do not walk into mountains.
            for (const neighbor of this.getNeighbors(visiting.index).filter(i => options.test(visiting.index, i))) {
                if (pathArray[neighbor] !== undefined) {
                    // This neighbor has been visited already. Skip.
                    continue;
                }

                // Mark the neighbor's source as our visiting node and
                // add to the nextQ.
                pathArray[neighbor] = visiting.index;
                nextQ.push({
                    index: neighbor,
                    distance: visiting.distance + 1,
                });
            }
        }
        return null;
    }

}
