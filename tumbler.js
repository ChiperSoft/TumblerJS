
(function (context, undefined) {
	'use strict';

	var tumbler = function tumbler() {

		var uniqueKeys = {
			string: '%[String]%',
			array:  '%[Array]%',
			object: '%[Object]%'
		};

		var seed = {
			branches: {}
		};

		var length = 0;
		var lastIndex = -1;

		function store(pattern, data, root, originalPattern) {
			//if the pattern is not an object, cast it to a string and wrap it in an object under a unique key name
			if (typeof pattern !== 'object') {
				var wrapper = {};
				wrapper[uniqueKeys.string] = String(pattern);
				pattern = wrapper;
			}

			var keys = Object.keys(pattern).sort();
			var keyLast = keys.length - 1;
			var keyIndex = -1;

			var trunk = root;

			function grabBranch(branch, leaf) { return branch.branches[leaf] || (branch.branches[leaf] = { branches: {} }); }

			function step() {
				if (++keyIndex > keyLast) {
					return;
				}

				var key = keys[keyIndex];
				var value = pattern[key];

				trunk = grabBranch(trunk, key);

				// if we find another object as the value, we need to create a new subtree
				// under an [object Object] branch so that we can perform submatches
				if (typeof value === 'object') {
					trunk = grabBranch(trunk, uniqueKeys.object);
					trunk.subtree = { branches: {} };
					store(value, data, trunk.subtree, originalPattern);
				} else {
					trunk = grabBranch(trunk, value);
				}

				step();
			}

			//arrays get their own root leaf to distinguish from plain objects
			if (Array.isArray(pattern)) {
				trunk = grabBranch(trunk, uniqueKeys.array);
			}

			//kick off the recursion
			step();

			//once the recursion ends, trunk should contain the destination of our stored data
			//but we don't want to store it if that branch has a subtree (object within object)
			if (!trunk.subtree) {
				lastIndex++;
				if (trunk.data) {
					trunk.data.push({data: data, index: lastIndex});
				} else {
					trunk.data = [{data: data, index: lastIndex}];
				}
				trunk.pattern = originalPattern;
			}

		}

		function match(pattern, root) {
			var matches = [];

			//if the pattern is not an object, cast it to a string and wrap it in an object under a unique key name
			if (typeof pattern !== 'object') {
				var wrapper = {};
				wrapper[uniqueKeys.string] = String(pattern);
				pattern = wrapper;
			}

			var keys = Object.keys(pattern).sort();

			//arrays get their own root leaf to distinguish from plain objects
			if (Array.isArray(pattern)) {
				if (root.branches[uniqueKeys.array]) {
					root = root.branches[uniqueKeys.array];
				} else {
					//collection does not contain any arrays, we have no matches
					return matches;
				}
			}

			function climb(trunk, keys, depth) {
				// if we have nothing to match at this level, return to previous level
				if (!keys.length) {
					return;
				}

				var key = keys[0];
				var value = pattern[key];

				//if the current trunk has a branch matching our current key with the value or a wildcard value, climb into that branch before moving on
				if (trunk.branches[key]) {
					var kbranch = trunk.branches[key];
					var vbranch, submatches;

					// if this key has a wildcard match, use it
					if (!!kbranch.branches['*']) {
						vbranch = kbranch.branches['*'];

					// if the value is an object, look for an object match
					} else if (typeof value === 'object') {
						if (!!kbranch.branches[uniqueKeys.object] && kbranch.branches[uniqueKeys.object].subtree) {
							submatches = match(value, kbranch.branches[uniqueKeys.object].subtree);
							if (submatches.length) {
								vbranch = kbranch.branches[uniqueKeys.object];
							}
						}

					// now see if the string of the value matches
					} else if (!!kbranch.branches[String(value)]) {
						vbranch = kbranch.branches[String(value)];
					}
					
					// if we have a value branch, react to it, otherwise continue on
					if (vbranch) {
						// if submatches were found on an object subtree, add them to the stack
						if (submatches) {
							matches = matches.concat(submatches);
						}

						// if data exists on the value branch, add it to the stack
						if (vbranch.data && (!submatches || submatches.length)) {
							vbranch.data.forEach(function (dataSet) {
								matches.push({data: dataSet.data, specificity: depth, index: dataSet.index, pattern: vbranch.pattern});
							});
						}

						//continue to next level in the tree
						climb(vbranch, keys.slice(1), depth + 1);
					}
				}

				// continue with next key at this level
				climb(trunk, keys.slice(1), depth);
			}

			// if there are any patterns at the base of the tree (empty object pattern), add those first.
			if (root.data) {
				root.data.forEach(function (dataSet) {
					matches.push({data: dataSet.data, specificity: 0, index: dataSet.index, pattern: root.pattern});
				});
			}

			//start climbind the tree.
			climb(root, keys, 1);

			return matches;
		}

		function matchFromSeed(pattern) {
			return match(pattern, seed)
				.sort(function (a, b) {
					if (a.specificity > b.specificity) return -1;
					if (a.specificity < b.specificity) return 1;

					if (a.index > b.index) return 1;
					if (a.index < b.index) return -1;

					if (a.data > b.data) return 1;
					if (a.data < b.data) return -1;

					return 0;
				});
		}

		function getFromSeed(pattern, all) {
			var matches = matchFromSeed(pattern);
			var jsonPattern = typeof pattern === 'function' ? String(pattern) : JSON.stringify(pattern);
			matches = matches.filter(function (d) { return d.pattern === jsonPattern; });
			return all ? matches : matches.pop();
		}

		return {
			add: function (pattern, data) {
				this.length = ++length;
				store(pattern, data, seed, typeof pattern === 'function' ? String(pattern) : JSON.stringify(pattern));
				return this;
			},
			remove: function () {
				return this;
			},
			get: function (pattern, all) {
				return getFromSeed(pattern, all);
			},
			getData: function (pattern, all) {
				var result = getFromSeed(pattern, all);
				return all ? result.map(function (d) {return d.data;}) : result && result.data || undefined;
			},
			match: function (pattern) {
				return matchFromSeed(pattern);
			},
			matchData: function (pattern) {
				return matchFromSeed(pattern).map(function (d) {return d.data;});
			},
			dump: function () { return seed; }
		};

	};


	if ( typeof module === 'object' && module && typeof module.exports === 'object' ) {
		//Running inside node
		module.exports = tumbler;

	} else if ( typeof define === 'function' && define.amd ) {
		//Running inside AMD
		define([], tumbler);
	} else {
		//Dunno where we are, add it to the global context with a noConflict

		var previous = context.tumbler;
		tumbler.noConflict = function () {
			context.tumbler = previous;
			return tumbler;
		};
		context.tumbler = tumbler;

	}

})(this);