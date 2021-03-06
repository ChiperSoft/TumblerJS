
(function (context, undefined) {
	'use strict';

	var pinvault = function pinvault() {

		var uniqueKeys = {
			string: '%[String]%',
			array:  '%[Array]%',
			object: '%[Object]%',
			objectEnd: '%[ObjectEnd]%'
		};

		var seed = {
			branches: {}
		};

		var length = 0;
		var lastIndex = -1;

		function store(pattern, data, root, originalPattern, subtree) {
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
				// once we return from that branch, we add an object cap to denote returning to
				// the previous level
				if (typeof value === 'object') {
					trunk = grabBranch(trunk, uniqueKeys.object);
					trunk = store(value, data, trunk, originalPattern, true);
					trunk = grabBranch(trunk, uniqueKeys.objectEnd);
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
			if (!subtree) {
				if (trunk.data) {
					trunk.data.push({data: data, index: lastIndex});
				} else {
					trunk.data = [{data: data, index: lastIndex}];
				}
				trunk.pattern = originalPattern;
			}

			return trunk;

		}

		function purge(pattern, root, originalPattern, data) {
			var count = 0;
			var keystack = [];
			var patternstack = [];

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

			function climb(trunk, keys) {
				var filtered;

				// if we have nothing to match at this level, return to previous level
				if (!keys.length) {
					var obranch;
					if ((obranch = trunk.branches[uniqueKeys.objectEnd])) {
						//return to the previous level's pattern and keys
						pattern = patternstack.pop();


						if (obranch.pattern == originalPattern) {
							if (data !== undefined) {
								filtered = obranch.data.filter(function (d) { return d.data !== data; });
								count += obranch.data.length - filtered.length;
								obranch.data = filtered;
							}

							if (data === undefined || !obranch.data.length) {
								count += obranch.data.length;
								delete obranch.data;
								delete obranch.pattern;
							}
						} else {

							//continue to next level in the tree
							climb(obranch, keystack.pop());

						}
							

						//cleanup empty objectend branches
						if (!Object.keys(obranch.branches).length && obranch.data === undefined && obranch.pattern === undefined) {
							delete trunk.branches[uniqueKeys.objectEnd];
						}
					}
					return;
				}
				
				var key = keys[0];
				var value = pattern[key];
				
				//if the current trunk has a branch matching our current key, climb into that branch
				if (trunk.branches[key]) {
					var kbranch = trunk.branches[key];
					var vbranch, subcount;

					// if this key has a wildcard match, use it
					if (typeof value === 'object') {
						if (!!kbranch.branches[uniqueKeys.object]) {
							vbranch = kbranch.branches[uniqueKeys.object];

							//descend into the subobject, pushing the previous layer to a stack
							// if (keys.length>1) {
								keystack.push(keys.slice(1));
							// }
							patternstack.push(pattern);
							pattern = value;

							keys = Object.keys(value).sort();
							keys.unshift(''); //have to add an extra value at the front, since we slice further down

						}

					// now see if the string of the value matches
					} else if (!!kbranch.branches[String(value)]) {
						vbranch = kbranch.branches[String(value)];
					}

					// if we have a value branch, react to it, otherwise continue on
					if (vbranch) {

						// if data exists on the value branch, add it to the stack
						if (vbranch.pattern == originalPattern) {
							if (data !== undefined) {
								filtered = vbranch.data.filter(function (d) { return d.data !== data; });
								count += vbranch.data.length - filtered.length;
								vbranch.data = filtered;
							}

							if (data === undefined || !vbranch.data.length) {
								count += vbranch.data.length;
								delete vbranch.data;
								delete vbranch.pattern;
							}
						} else {

							//continue to next level in the tree
							climb(vbranch, keys.slice(1));

						}

						//clean up any empty branches
						if (!Object.keys(vbranch.branches).length && vbranch.data === undefined && vbranch.pattern === undefined) {
							if (typeof value === 'object') {
								delete kbranch.branches[uniqueKeys.object];
							} else {
								delete kbranch.branches[String(value)];
							}
						}
					}

					if (!Object.keys(kbranch.branches).length && kbranch.data === undefined && kbranch.pattern === undefined) {
						delete trunk.branches[key];
					}
				}
			}

			//if pattern is an empty object
			if (!keys.length && root.pattern == originalPattern) {
				if (data !== undefined) {
					var filtered = root.data.filter(function (d) { return d.data !== data; });
					count += root.data.length - filter.length;
					root.data = filtered;
				}

				if (data === undefined || !root.data.length) {
					count += root.data.length;
					delete root.data;
					delete root.pattern;
				}
			} else {

				climb(root, keys);

			}

			return count;
		}


		function match(pattern, root) {
			var matches = [];
			var keystack = [];
			var patternstack = [];

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
					var obranch;
					if ((obranch = trunk.branches[uniqueKeys.objectEnd])) {
						// if data exists on the value branch, add it to the stack
						if (obranch.data) {
							obranch.data.forEach(function (dataSet) {
								matches.push({data: dataSet.data, specificity: depth, index: dataSet.index, pattern: obranch.pattern});
							});
						}
						
						//return to the previous level's pattern and keys
						pattern = patternstack.pop();

						climb(obranch, keystack.pop(), depth + 1);

					}
					return;
				}

				var key = keys[0];
				var value = pattern[key];

				//if the current trunk has a branch matching our current key, climb into that branch
				if (trunk.branches[key]) {
					var kbranch = trunk.branches[key];
					var vbranch;

					// if this key has a wildcard match, use it
					if (!!kbranch.branches['*']) {
						vbranch = kbranch.branches['*'];

					// if the value is an object, look for an object match
					} else if (typeof value === 'object') {
						if (!!kbranch.branches[uniqueKeys.object]) {
							vbranch = kbranch.branches[uniqueKeys.object];

							//descend into the subobject, pushing the previous layer to a stack
							patternstack.push(pattern);
							pattern = value;

							keystack.push(keys.slice(1));
							keys = Object.keys(value).sort();
							keys.unshift(''); //have to add an extra value at the front, since we slice further down

						}

					// now see if the string of the value matches
					} else if (!!kbranch.branches[String(value)]) {
						vbranch = kbranch.branches[String(value)];
					}
					
					// if we have a value branch, react to it, otherwise continue on
					if (vbranch) {

						// if data exists on the value branch, add it to the stack
						if (vbranch.data) {
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
			var matches = match(pattern, seed);

			matches.sort(function (a, b) {
				if (a.specificity > b.specificity) return -1;
				if (a.specificity < b.specificity) return 1;

				if (a.index > b.index) return 1;
				if (a.index < b.index) return -1;

				if (a.data > b.data) return 1;
				if (a.data < b.data) return -1;

				return 0;
			});

			return matches;

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
				lastIndex++;
				store(pattern, data, seed, typeof pattern === 'function' ? String(pattern) : JSON.stringify(pattern));
				return this;
			},
			remove: function (pattern, data, howMany) {
				var jsonPattern = typeof pattern === 'function' ? String(pattern) : JSON.stringify(pattern);
				var count = purge(pattern, seed, jsonPattern, data);
				this.length -= count;
				return howMany ? count : this;
			},
			get: function (pattern, all) {
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
		module.exports = pinvault;

	} else if ( typeof define === 'function' && define.amd ) {
		//Running inside AMD
		define([], function () {return pinvault;});
	} else {
		//Dunno where we are, add it to the global context with a noConflict

		var previous = context.pinvault;
		pinvault.noConflict = function () {
			context.pinvault = previous;
			return pinvault;
		};
		context.pinvault = pinvault;

	}

})(this);