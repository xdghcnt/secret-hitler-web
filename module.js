function init(wsServer, path) {
    const
        fs = require("fs"),
        EventEmitter = require("events"),
        express = require("express"),
        exec = require("child_process").exec,
        app = wsServer.app,
        registry = wsServer.users,
        channel = "secret-hitler",
        testMode = false;

    app.post("/secret-hitler/upload-avatar", function (req, res) {
        registry.log(`secret-hitler - ${req.body.userId} - upload-avatar`);
        if (req.files && req.files.avatar && registry.checkUserToken(req.body.userId, req.body.userToken)) {
            const userDir = `${registry.config.appDir || __dirname}/public/avatars/${req.body.userId}`;
            exec(`rm -r ${userDir}`, () => {
                fs.mkdir(userDir, () => {
                    req.files.avatar.mv(`${userDir}/${req.files.avatar.md5}.png`, function (err) {
                        if (err) {
                            log(`fileUpload mv error ${err}`);
                            return res.status(500).send("FAIL");
                        }
                        res.send(req.files.avatar.md5);
                    });
                })

            });
        } else res.status(500).send("Wrong data");
    });
    app.use("/secret-hitler", express.static(`${__dirname}/public`));
    if (registry.config.appDir)
        app.use("/secret-hitler", express.static(`${registry.config.appDir}/public`));
    app.get(path, (req, res) => {
        res.sendFile(`${__dirname}/public/app.html`);
    });

    class GameState extends EventEmitter {
        constructor(hostId, hostData, userRegistry) {
            super();
            const
                state = {
                    players: {},
                    deck: [],
                    discardDeck: []
                },
                room = {
                    inited: true,
                    hostId: hostId,
                    spectators: new JSONSet(),
                    playerNames: {},
                    onlinePlayers: new JSONSet(),
                    blackSlotPlayers: new JSONSet(),
                    playerSlots: Array(10).fill(null),
                    teamsLocked: false,
                    playerAvatars: {},
                    phase: "idle",
                    presAction: null, // inspect, inspect-deck, election, shooting
                    prevPres: null,
                    prevCan: null,
                    currentPres: null,
                    currentCan: null,
                    playersVotes: null,
                    playersVoted: new JSONSet(),
                    playersShot: new JSONSet(),
                    playersInspected: new JSONSet(),
                    playersNotHitler: new JSONSet(),
                    activeSlots: new JSONSet(),
                    vetoRequest: null,
                    vetoActive: false,
                    specialElection: false,
                    skipTrack: 0,
                    libTrack: 0,
                    fascTrack: 0,
                    voteLogs: {},
                    voteLogsFull: [],
                    deckSize: state.deck.length,
                    discardSize: state.discardDeck.length,
                    libWin: null,
                    fCount: 11,
                    lCount: 6,
                    shufflePlayers: true,
                    rebalanced: false
                },
                players = state.players;
            if (testMode)
                [1, 2, 3, 4, 5, 6, 7].forEach((ind) => {
                    room.playerSlots[ind] = `kek${ind}`;
                    room.playerNames[`kek${ind}`] = `kek${ind}`;
                });
            this.room = room;
            this.state = state;
            this.lastInteraction = new Date();
            const
                send = (target, event, data) => userRegistry.send(target, event, data),
                update = () => {
                    updateDeckSize();
                    send(room.onlinePlayers, "state", room);
                },
                sendState = (user) => {
                    const slot = room.playerSlots.indexOf(user);
                    if (room.phase === "idle" || room.blackSlotPlayers.has(user))
                        send(user, "player-state", players);
                    else if (players[slot] && (players[slot].role === "f"
                        || (room.activeSlots.size < 7 && players[slot].role === "h")))
                        send(user, "player-state", players);
                    else if (players[slot])
                        send(user, "player-state", {[slot]: players[slot]});
                    else
                        send(user, "player-state", {})
                },
                sendStateSlot = (slot) => sendState(room.playerSlots[slot]),
                updateState = () => [...room.onlinePlayers].forEach(sendState),
                getRandomPlayer = (exclude, allowEmptySlot) => {
                    const res = [];
                    room.playerSlots.forEach((user, slot) => {
                        if ((allowEmptySlot || user !== null) && !~exclude.indexOf(slot))
                            res.push(slot);
                    });
                    return shuffleArray(res)[0];
                },
                startGame = () => {
                    const playersCount = room.playerSlots.filter((user) => user !== null).length;
                    if (playersCount > 3) {
                        room.libTrack = 0;
                        room.fascTrack = 0;
                        room.skipTrack = 0;
                        room.voteLogs = {};
                        room.voteLogsFull = [];
                        room.activeSlots = new JSONSet();
                        room.teamsLocked = true;
                        room.libWin = null;
                        room.presAction = null;
                        room.prevPres = null;
                        room.prevCan = null;
                        room.currentCan = null;
                        room.playersVotes = null;
                        room.playersVoted = new JSONSet();
                        room.playersShot = new JSONSet();
                        room.playersInspected = new JSONSet();
                        room.playersNotHitler = new JSONSet();
                        room.vetoActive = false;
                        room.vetoRequest = null;
                        room.specialElection = false;
                        room.fCount = 11;
                        room.lCount = 6;
                        if (room.libWin !== null && room.shufflePlayers)
                            shufflePlayers();
                        room.playerSlots.forEach((player, slot) => {
                            if (player != null) {
                                room.activeSlots.add(slot);
                                players[slot] = {
                                    role: "l",
                                    inspect: null,
                                    vote: null,
                                    cards: []
                                };
                            } else
                                delete players[slot];
                        });
                        const
                            hitler = getRandomPlayer([]),
                            fasc1 = getRandomPlayer([hitler]);
                        players[hitler].role = "h";
                        players[fasc1].role = "f";
                        if (playersCount > 6) {
                            const fasc2 = getRandomPlayer([hitler, fasc1]);
                            players[fasc2].role = "f";
                            if (playersCount > 8)
                                players[getRandomPlayer([hitler, fasc1, fasc2])].role = "f";
                        }
                        room.currentPres = getRandomPlayer([]);
                        if (room.rebalanced) {
                            if (room.activeSlots.size === 6)
                                room.fascTrack = 1;
                            else if (room.activeSlots === 7)
                                room.fCount = 10;
                            else if (room.activeSlots === 9)
                                room.fCount = 9;
                        }
                        state.deck = shuffleArray(Array(room.fCount).fill("f").concat(Array(room.lCount).fill("l")));
                        state.discardDeck = [];
                        startSelectCan();
                        updateState();
                    } else endGame();
                },
                updateDeckSize = () => {
                    room.deckSize = state.deck.length;
                    room.discardSize = state.discardDeck.length;
                },
                shufflePlayers = () => {
                    const
                        usedSlots = [],
                        users = [];
                    room.playerSlots.forEach((user, slot) => {
                        if (user) {
                            usedSlots.push(slot);
                            users.push(user);
                        }
                    });
                    shuffleArray(usedSlots).forEach((slot, index) => {
                        room.playerSlots[slot] = users[index];
                    });
                },
                getNextSlot = (slot) => {
                    slot++;
                    while (!players[slot] || room.playersShot.has(slot)) {
                        if (slot === 10)
                            slot = 0;
                        else
                            slot++;
                    }
                    return slot;
                },
                startSelectCan = () => {
                    room.phase = "select-can";
                    update();
                },
                startVoting = () => {
                    room.phase = "voting";
                    room.playersVotes = null;
                    room.playersVoted.clear();
                    Object.keys(players).forEach((slot) => {
                        players[slot].vote = null;
                    });
                    updateState();
                    update();
                },
                startPresDraw = () => {
                    room.phase = "pres-draw";
                    players[room.currentPres].cards = state.deck.splice(0, 3);
                    update();
                    sendStateSlot(room.currentPres);
                },
                startCanDraw = () => {
                    room.phase = "can-draw";
                    players[room.currentCan].cards = players[room.currentPres].cards.splice(0);
                    update();
                    sendStateSlot(room.currentCan);
                    sendStateSlot(room.currentPres);
                },
                startPresAction = () => {
                    room.phase = "pres-action";
                    const
                        playerCount = room.activeSlots.size,
                        gameType = playerCount < 7 ? "small" : (playerCount < 9 ? "medium" : "large");
                    room.presAction = {
                        small: [null, null, "inspect-deck", "shooting", "shooting"],
                        medium: [null, "inspect", "election", "shooting", "shooting"],
                        large: ["inspect", "inspect", "election", "shooting", "shooting"]
                    }[gameType][room.fascTrack - 1];
                    if (room.presAction === "inspect-deck") {
                        players[room.currentPres].cards = state.deck.splice(0, 3);
                        sendStateSlot(room.currentPres);
                    }
                    if (!room.presAction)
                        nextPres();
                    else
                        update();
                },
                nextPres = () => {
                    room.prevCan = room.currentCan;
                    room.currentCan = null;
                    const nextPres = getNextSlot(room.specialElection ? room.prevPres : room.currentPres);
                    room.prevPres = room.currentPres;
                    room.currentPres = nextPres;
                    room.specialElection = null;
                    Object.keys(players).forEach((slot) => {
                        players[slot].vote = null;
                    });
                    if (room.fascTrack === 5)
                        room.vetoActive = true;
                    room.vetoRequest = null;
                    startSelectCan();
                },
                incrSkipTrack = () => {
                    room.skipTrack += 1;
                    if (room.skipTrack === 3) {
                        room.skipTrack = 0;
                        enactCard(state.deck.splice(0, 1)[0])
                    }
                },
                enactCard = (card) => {
                    room.vetoRequest = null;
                    room.skipTrack = 0;
                    room[(card === "l" ? "libTrack" : "fascTrack")] += 1;
                    if (room.libTrack === 5) {
                        room.libWin = true;
                        endGame();
                    } else if (room.fascTrack === 6) {
                        room.libWin = false;
                        endGame();
                    }
                    processReshuffle();
                },
                processReshuffle = () => {
                    if (state.deck.length < 3)
                        state.deck.push(...state.discardDeck.splice(0));
                },
                isEnoughPlayers = () => room.playerSlots.filter((user) => user !== null).length > 4,
                endGame = () => {
                    room.phase = "idle";
                    if (!isEnoughPlayers())
                        room.teamsLocked = false;
                    update();
                    updateState();
                },
                removePlayer = (playerId) => {
                    if (room.spectators.has(playerId)) {
                        registry.disconnectUser(playerId, "Kicked");
                        room.spectators.delete(playerId);
                    } else {
                        room.playerSlots[room.playerSlots.indexOf(playerId)] = null;
                        if (room.onlinePlayers.has(playerId)) {
                            room.spectators.add(playerId);
                            sendState(playerId);
                        }
                    }
                },
                userJoin = (data) => {
                    const user = data.userId;
                    if (!room.playerNames[user])
                        room.spectators.add(user);
                    room.onlinePlayers.add(user);
                    room.playerNames[user] = data.userName.substr && data.userName.substr(0, 60);
                    if (data.avatarId) {
                        fs.stat(`${registry.config.appDir || __dirname}/public/avatars/${user}/${data.avatarId}.png`, (err) => {
                            if (!err) {
                                room.playerAvatars[user] = data.avatarId;
                                update()
                            }
                        });
                    }
                    update();
                    sendState(user);
                },
                userLeft = (user) => {
                    room.onlinePlayers.delete(user);
                    if (room.spectators.has(user))
                        delete room.playerNames[user];
                    room.spectators.delete(user);
                    update();
                },
                userEvent = (user, event, data) => {
                    this.lastInteraction = new Date();
                    try {
                        if (this.userEventHandlers[event])
                            this.userEventHandlers[event](user, data[0], data[1], data[2], data[3]);
                        else if (this.slotEventHandlers[event] && ~room.playerSlots.indexOf(user))
                            this.slotEventHandlers[event](room.playerSlots.indexOf(user), data[0], data[1], data[2], data[3]);
                    } catch (error) {
                        console.error(error);
                        registry.log(error.message);
                    }
                };
            this.userJoin = userJoin;
            this.userLeft = userLeft;
            this.userEvent = userEvent;
            this.slotEventHandlers = {
                "set-can": (slot, canSlot) => {
                    if (room.phase === "select-can" && room.currentPres === slot && room.prevCan !== canSlot && slot !== canSlot
                        && !room.playersShot.has(canSlot) && room.activeSlots.has(slot)
                        && (room.prevPres !== canSlot || (room.activeSlots.size - room.playersShot.size) <= 5)) {
                        room.currentCan = canSlot;
                        startVoting();
                    }
                },
                "vote": (slot, vote) => {
                    if (room.phase === "voting" && players[slot] && !room.playersShot.has(slot) && ~[null, true, false].indexOf(vote)) {
                        if (players[slot].vote !== null) {
                            players[slot].vote = null;
                            room.playersVoted.delete(slot);
                        } else {
                            room.playersVoted.add(slot);
                            players[slot].vote = vote;
                        }
                        sendStateSlot(slot);
                        if (room.playersVoted.size === (room.activeSlots.size - room.playersShot.size)) {
                            room.playersVotes = {};
                            [...room.playersVoted].forEach((slot) => {
                                room.playersVotes[slot] = players[slot].vote;
                            });
                            if (Object.keys(players).filter((slot) => players[slot].vote).length > Object.keys(players).filter((it) =>
                                !room.playersShot.has(it)).length / 2) {
                                if (room.fascTrack >= 3 && players[room.currentCan].role === "h") {
                                    room.libWin = false;
                                    endGame();
                                } else {
                                    if (room.fascTrack >= 3)
                                        room.playersNotHitler.add(room.currentCan);
                                    startPresDraw();
                                }
                            } else {
                                room.currentCan = null;
                                room.specialElection = null;
                                room.currentPres = getNextSlot(room.currentPres);
                                incrSkipTrack();
                                if (room.phase !== "idle")
                                    startSelectCan();
                            }
                        } else
                            update();
                    }
                },
                "pres-discards": (slot, card) => {
                    if (room.phase === "pres-draw" && room.currentPres === slot
                        && ~[0, 1, 2].indexOf(card)) {
                        state.discardDeck.push(players[room.currentPres].cards.splice(card, 1)[0]);
                        startCanDraw();
                    }
                },
                "can-discards": (slot, card) => {
                    if (room.phase === "can-draw" && room.currentCan === slot
                        && ~[0, 1].indexOf(card)) {
                        state.discardDeck.push(players[room.currentCan].cards.splice(card, 1)[0]);
                        const enactedCard = players[room.currentCan].cards.splice(0, 1)[0];
                        sendStateSlot(room.currentCan);
                        enactCard(enactedCard);
                        if (room.phase !== "idle") {
                            if (enactedCard === "l")
                                nextPres();
                            else
                                startPresAction();
                        }
                    }
                },
                "inspect": (slot, inspectSlot) => {
                    if (room.presAction === "inspect" && room.currentPres === slot && players[inspectSlot]
                        && !room.playersInspected.has(inspectSlot) && slot !== inspectSlot) {
                        players[slot].inspect = {
                            slot: inspectSlot,
                            party: players[inspectSlot].role === "l" ? "l" : "f"
                        };
                        room.playersInspected.add(inspectSlot);
                        room.presAction = null;
                        sendStateSlot(slot);
                        nextPres();
                    }
                },
                "shot": (slot, shootSlot) => {
                    if (room.presAction === "shooting" && room.currentPres === slot && players[shootSlot]
                        && !room.playersShot.has(shootSlot) && slot !== shootSlot) {
                        room.playersShot.add(shootSlot);
                        room.presAction = null;
                        if (players[shootSlot].role === "h") {
                            room.libWin = true;
                            endGame();
                        } else
                            nextPres();
                    }
                },
                "set-pres": (slot, presSlot) => {
                    if (room.presAction === "election" && room.currentPres === slot && players[presSlot] && slot !== presSlot) {
                        room.prevPres = room.currentPres;
                        room.currentPres = presSlot;
                        room.prevCan = room.currentCan;
                        room.currentCan = null;
                        room.presAction = null;
                        room.specialElection = true;
                        startSelectCan();
                    }
                },
                "inspect-deck-end": (slot) => {
                    if (room.presAction === "inspect-deck" && room.currentPres === slot) {
                        room.presAction = null;
                        state.deck.unshift(...players[room.currentPres].cards.splice(0));
                        sendStateSlot(room.currentPres);
                        nextPres();
                    }
                },
                "ask-veto": (slot) => {
                    if (room.phase === "can-draw" && room.currentCan === slot && room.fascTrack === 5 && room.vetoRequest !== false) {
                        room.vetoRequest = true;
                        update();
                    }
                },
                "accept-veto": (slot, accept) => {
                    if (room.phase === "can-draw" && room.currentPres === slot && room.vetoRequest) {
                        if (accept) {
                            state.discardDeck.push(...players[room.currentCan].cards.splice(0));
                            sendStateSlot(room.currentPres);
                            processReshuffle();
                            incrSkipTrack();
                            if (room.libWin === null)
                                nextPres();
                        } else
                            room.vetoRequest = false;
                        update();
                    }
                },
                "test-command": (slot, command) => {
                    if (testMode) {
                        if (room.phase === "voting" && command === "vote-pass")
                            room.activeSlots.forEach((activeSlot) => {
                                if (slot !== activeSlot && !room.playersShot.has(activeSlot)) {
                                    room.playersVoted.add(activeSlot);
                                    players[activeSlot].vote = true;
                                }
                            });
                        else if (room.phase === "voting" && command === "vote-fail")
                            room.activeSlots.forEach((activeSlot) => {
                                if (slot !== activeSlot && !room.playersShot.has(activeSlot)) {
                                    room.playersVoted.add(activeSlot);
                                    players[activeSlot].vote = false;
                                }
                            });
                        update();
                        updateState();
                    }
                }
            };
            this.userEventHandlers = {
                "start-game": (user) => {
                    if (user === room.hostId)
                        startGame();
                },
                "update-avatar": (user, id) => {
                    room.playerAvatars[user] = id;
                    update()
                },
                "toggle-lock": (user) => {
                    if (user === room.hostId)
                        room.teamsLocked = !room.teamsLocked;
                    update();
                },
                "change-name": (user, value) => {
                    if (value)
                        room.playerNames[user] = value.substr && value.substr(0, 60);
                    update();
                },
                "remove-player": (user, playerId) => {
                    if (playerId && user === room.hostId)
                        removePlayer(playerId);
                    update();
                },
                "give-host": (user, playerId) => {
                    if (playerId && user === room.hostId) {
                        room.hostId = playerId;
                        this.emit("host-changed", user, playerId);
                    }
                    update();
                },
                "toggle-black-slot": (user, playerId) => {
                    if (user === room.hostId && room.spectators.has(playerId)) {
                        if (!room.blackSlotPlayers.has(playerId))
                            room.blackSlotPlayers.add(playerId);
                        else
                            room.blackSlotPlayers.delete(playerId);
                    }
                    update();
                    sendState(playerId);
                },
                "players-join": (user, slot) => {
                    if (!room.teamsLocked && room.playerSlots[slot] === null) {
                        if (~room.playerSlots.indexOf(user))
                            room.playerSlots[room.playerSlots.indexOf(user)] = null;
                        room.spectators.delete(user);
                        room.playerSlots[slot] = user;
                        room.blackSlotPlayers.delete(user);
                        update();
                        sendState(user);
                    }
                },
                "spectators-join": (user) => {
                    if (!room.teamsLocked && ~room.playerSlots.indexOf(user)) {
                        room.playerSlots[room.playerSlots.indexOf(user)] = null;
                        room.spectators.add(user);
                        update();
                        sendState(user);
                    }
                },
                "notes": (user, notes) => {
                    if (user === room.hostId) {
                        room.notes = notes;
                        update();
                    }
                }
            };
        }

        getPlayerCount() {
            return Object.keys(this.room.playerNames).length;
        }

        getActivePlayerCount() {
            return this.room.onlinePlayers.size;
        }

        getLastInteraction() {
            return this.lastInteraction;
        }

        getSnapshot() {
            return {
                room: this.room,
                state: this.state
            };
        }

        setSnapshot(snapshot) {
            Object.assign(this.room, snapshot.room);
            Object.assign(this.state, snapshot.state);
            this.room.onlinePlayers = new JSONSet(this.room.onlinePlayers);
            this.room.spectators = new JSONSet(this.room.spectators);
            this.room.playersVoted = new JSONSet(this.room.playersVoted);
            this.room.playersShot = new JSONSet(this.room.playersShot);
            this.room.playersInspected = new JSONSet(this.room.playersInspected);
            this.room.playersNotHitler = new JSONSet(this.room.playersNotHitler);
            this.room.spectators = new JSONSet(this.room.spectators);
            this.room.blackSlotPlayers = new JSONSet(this.room.blackSlotPlayers);
            this.room.activeSlots = new JSONSet(this.room.activeSlots);
            this.room.onlinePlayers.clear();
        }
    }

    function makeId() {
        let text = "";
        const possible = "abcdefghijklmnopqrstuvwxyz0123456789";

        for (let i = 0; i < 5; i++)
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    }

    function shuffleArray(array) {
        let currentIndex = array.length, temporaryValue, randomIndex;
        while (0 !== currentIndex) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex -= 1;
            temporaryValue = array[currentIndex];
            array[currentIndex] = array[randomIndex];
            array[randomIndex] = temporaryValue;
        }
        return array;
    }

    class JSONSet extends Set {
        constructor(iterable) {
            super(iterable)
        }

        toJSON() {
            return [...this]
        }
    }

    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    }

    registry.createRoomManager(path, channel, GameState);
}

module.exports = init;