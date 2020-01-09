function init(wsServer, path) {
    const
        fs = require("fs"),
        EventEmitter = require("events"),
        express = require("express"),
        exec = require("child_process").exec,
        app = wsServer.app,
        registry = wsServer.users,
        channel = "secret-hitler",
        testMode = process.argv[2] === "debug";

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

    registry.handleAppPage(path, `${__dirname}/public/app.html`);

    class GameState extends EventEmitter {
        constructor(hostId, hostData, userRegistry) {
            super();
            const
                getResetParams = () => ({
                    libTrack: 0,
                    fascTrack: 0,
                    comTrack: 0,
                    skipTrack: 0,
                    activeSlots: new JSONSet(),
                    presAction: null,
                    prevPres: null,
                    prevCan: null,
                    currentPres: null,
                    currentCan: null,
                    playersVotes: null,
                    playersVoted: new JSONSet(),
                    playersShot: new JSONSet(),
                    playersInspected: new JSONSet(),
                    playersNotHitler: new JSONSet(),
                    whiteBoard: [],
                    vetoActive: false,
                    vetoRequest: null,
                    specialElection: false,
                    fCount: 11,
                    lCount: 6,
                    cCount: 6,
                    paused: false,
                    time: null,
                    timeTotal: null
                }),
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
                    deckSize: state.deck.length,
                    discardSize: state.discardDeck.length,
                    partyWin: null,
                    shufflePlayers: true,
                    rebalanced: false,
                    timed: false,
                    timeChanged: false,
                    actionTime: 180,
                    smallActionTime: 30,
                    triTeam: false,
                    testMode
                },
                resetRoom = () => Object.assign(room, getResetParams()),
                players = state.players;
            resetRoom();
            let playerRoles = {};
            if (testMode)
                [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach((ind) => {
                    room.playerSlots[ind] = `kek${ind}`;
                    room.playerNames[`kek${ind}`] = `kek${ind}`;
                });
            this.room = room;
            this.state = state;
            this.lastInteraction = new Date();
            let timerInterval;
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
                        if (!room.triTeam)
                            send(user, "player-state", Object.assign({}, playerRoles, {[slot]: players[slot]}));
                        else
                            send(user, "player-state",
                                Object.assign({}, getFilteredPlayers(["f", "h"]), {[slot]: players[slot]})
                            );
                    else if (players[slot] && (players[slot].role === "c"))
                        send(user, "player-state",
                            Object.assign({}, getFilteredPlayers(["c"]), {[slot]: players[slot]})
                        );
                    else if (players[slot])
                        send(user, "player-state", {[slot]: players[slot]});
                    else
                        send(user, "player-state", {})
                },
                sendStateSlot = (slot) => sendState(room.playerSlots[slot]),
                updateState = () => [...room.onlinePlayers].forEach(sendState),
                getFilteredPlayers = (roles) => {
                    return Object.keys(playerRoles)
                        .filter((slot) => roles.includes(playerRoles[slot].role))
                        .reduce((res, slot) => {
                            res[slot] = playerRoles[slot];
                            return res;
                        }, {});
                },
                getRandomPlayer = (exclude, allowEmptySlot) => {
                    const res = [];
                    room.playerSlots.forEach((user, slot) => {
                        if ((allowEmptySlot || user !== null) && !~exclude.indexOf(slot))
                            res.push(slot);
                    });
                    return shuffleArray(res)[0];
                },
                startTimer = () => {
                    if (room.timed) {
                        if (~["pres-draw", "can-draw"].indexOf(room.phase) || ~["inspect", "inspect-deck"].indexOf(room.presAction))
                            room.time = room.timeTotal = room.smallActionTime * 1000;
                        else
                            room.time = room.timeTotal = room.actionTime * 1000;
                        let time = new Date();
                        clearInterval(timerInterval);
                        timerInterval = setInterval(() => {
                            if (!room.paused) {
                                room.time -= new Date() - time;
                                time = new Date();
                                if (room.time <= 0) {
                                    clearInterval(timerInterval);
                                    let failed;
                                    if (~["pres-draw", "pres-action", "select-can"].indexOf(room.phase))
                                        failed = room.currentPres;
                                    else if (room.phase === "can-draw")
                                        failed = room.currentCan;
                                    else if (room.phase === "voting") {
                                        room.playersVotes = {};
                                        [...room.playersVoted].forEach((slot) => {
                                            room.playersVotes[slot] = players[slot].vote;
                                        });
                                        failed = shuffleArray([...room.activeSlots].filter((slot) => !room.playersVoted.has(slot)
                                            && !room.playersShot.has(slot)))[0];
                                    }
                                    if (failed != null) {
                                        room.whiteBoard.push({
                                            type: "timer-fail",
                                            slotFailed: failed
                                        });
                                        room.partyWin = state.players[failed].role !== "c"
                                            ? (state.players[failed].role === "l" ? "f" : "l")
                                            : shuffleArray(["f", "l"])[0];
                                    }
                                    endGame();
                                }
                            } else time = new Date();
                        }, 100);
                    }
                },
                startGame = () => {
                    const playersCount = room.playerSlots.filter((user) => user !== null).length;
                    if (isEnoughPlayers()) {
                        resetRoom();
                        if (room.partyWin !== null && room.shufflePlayers)
                            shufflePlayers();
                        room.partyWin = null;
                        room.teamsLocked = true;
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
                            activeRoles = [],
                            addRole = (role) => {
                                let player = getRandomPlayer(activeRoles);
                                players[player].role = role;
                                activeRoles.push(player);
                            };
                        let player = getRandomPlayer(activeRoles);
                        addRole("h");
                        addRole("f");
                        if (playersCount > 6) {
                            addRole("f");
                            if (playersCount > 8) {
                                if (room.triTeam) {
                                    addRole("c");
                                    if (playersCount === 10)
                                        addRole("c");
                                } else addRole("f");
                            }
                        }
                        room.currentPres = getRandomPlayer([]);
                        playerRoles = {};
                        room.activeSlots.forEach((slot) => {
                            playerRoles[slot] = {role: players[slot].role};
                        });
                        if (room.rebalanced) {
                            if (room.activeSlots.size === 6)
                                room.fascTrack = 1;
                            else if (room.activeSlots === 7)
                                room.fCount = 10;
                            else if (room.activeSlots === 9)
                                room.fCount = 9;
                        }
                        state.deck = shuffleArray([]
                            .concat(Array(room.fCount).fill("f"))
                            .concat(Array(room.lCount).fill("l"))
                            .concat(room.triTeam ? Array(room.cCount).fill("c") : [])
                        );
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
                getNextPresSlot = () => {
                    let slot = room.specialElection ? room.prevPres : room.currentPres;
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
                    startTimer();
                    update();
                },
                startVoting = () => {
                    room.phase = "voting";
                    room.playersVotes = null;
                    room.playersVoted.clear();
                    Object.keys(players).forEach((slot) => {
                        players[slot].vote = null;
                    });
                    startTimer();
                    updateState();
                    update();
                },
                startPresDraw = () => {
                    room.phase = "pres-draw";
                    players[room.currentPres].cards = state.deck.splice(0, 3);
                    startTimer();
                    update();
                    sendStateSlot(room.currentPres);
                },
                startCanDraw = () => {
                    room.phase = "can-draw";
                    players[room.currentCan].cards = players[room.currentPres].cards.splice(0);
                    startTimer();
                    update();
                    sendStateSlot(room.currentCan);
                    sendStateSlot(room.currentPres);
                },
                startPresAction = (enactedCard) => {
                    room.phase = "pres-action";
                    const
                        playerCount = room.activeSlots.size,
                        gameType = playerCount < 7 ? "small" : (playerCount < 9 ? "medium" : "large");
                    if (enactedCard === "f")
                        room.presAction = {
                            small: [null, null, "inspect-deck", "shooting", "shooting"],
                            medium: [null, "inspect", "election", "shooting", "shooting"],
                            large: ["inspect", "inspect", "election", "shooting", "shooting"]
                        }[gameType][room.fascTrack - 1];
                    else if (enactedCard === "c")
                        room.presAction = ["inspect", "election", "shooting"][room.comTrack - 1];
                    if (room.presAction === "inspect-deck") {
                        players[room.currentPres].cards = state.deck.splice(0, 3);
                        sendStateSlot(room.currentPres);
                    }
                    if (!room.presAction)
                        nextPres();
                    else {
                        startTimer();
                        update();
                    }
                },
                nextPres = () => {
                    room.prevCan = room.currentCan;
                    room.currentCan = null;
                    const nextPres = getNextPresSlot();
                    room.prevPres = room.currentPres;
                    room.currentPres = nextPres;
                    room.specialElection = false;
                    Object.keys(players).forEach((slot) => {
                        players[slot].vote = null;
                    });
                    room.vetoRequest = null;
                    startSelectCan();
                },
                incrSkipTrack = () => {
                    room.skipTrack += 1;
                    if (room.skipTrack === 3) {
                        room.skipTrack = 0;
                        room.prevCan = null;
                        room.prevPres = null;
                        const card = state.deck.splice(0, 1)[0];
                        room.whiteBoard.push({type: "topdeck", card: card.toUpperCase()});
                        enactCard(card, true)
                    }
                },
                enactCard = (card, isTopdeck) => {
                    if (!isTopdeck) {
                        const lastClaim = room.whiteBoard[room.whiteBoard.length - 1];
                        lastClaim.type = "enact";
                        lastClaim.claims = [["???", "??", (!room.triTeam && card === "f") ? "FF" : "??", card.toUpperCase()]];
                        lastClaim.card = card.toUpperCase();
                        if (room.vetoRequest === false)
                            lastClaim.vetoDenied = true;
                    }
                    room.vetoRequest = null;
                    room.skipTrack = 0;
                    room[{
                        l: "libTrack",
                        f: "fascTrack",
                        c: "comTrack"
                    }[card]] += 1;
                    if (room.libTrack === 5) {
                        room.partyWin = "l";
                        endGame();
                    } else if (room.fascTrack === 6) {
                        room.partyWin = "f";
                        endGame();
                    } else if (room.comTrack === 4) {
                        room.partyWin = "c";
                        endGame();
                    } else if (room.fascTrack === 5)
                        room.vetoActive = true;
                    else if (room.comTrack === 3)
                        room.vetoActive = true;
                    processReshuffle();
                },
                processReshuffle = () => {
                    if (state.deck.length < 3) {
                        room.whiteBoard.push({type: "reshuffle"});
                        state.deck.push(...state.discardDeck.splice(0));
                        shuffleArray(state.deck);
                    }
                },
                isEnoughPlayers = () => room.playerSlots.filter((user) => user !== null).length > (!room.triTeam ? 4 : 8),
                endGame = () => {
                    room.phase = "idle";
                    room.paused = true;
                    if (!isEnoughPlayers())
                        room.teamsLocked = false;
                    update();
                    updateState();
                },
                removePlayer = (playerId) => {
                    if (room.spectators.has(playerId)) {
                        this.emit("user-kicked", playerId);
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
                            const votePassed = [...room.activeSlots].filter((slot) => players[slot].vote).length > [...room.activeSlots].filter((slot) =>
                                !room.playersShot.has(slot)).length / 2;
                            room.playersVotes = {};
                            [...room.playersVoted].forEach((slot) => {
                                room.playersVotes[slot] = players[slot].vote;
                            });
                            room.whiteBoard.push({
                                type: votePassed ? "pre-enact" : "skip",
                                pres: room.currentPres,
                                can: room.currentCan,
                                presClaimed: false,
                                canClaimed: false,
                                votes: {
                                    ja: [...room.activeSlots].filter((slot) => players[slot].vote),
                                    nein: [...room.activeSlots].filter((slot) => !room.playersShot.has(slot)
                                        && !players[slot].vote)
                                }
                            });
                            if (votePassed) {
                                if (room.fascTrack >= 3 && players[room.currentCan].role === "h") {
                                    room.partyWin = "f";
                                    endGame();
                                } else {
                                    if (room.fascTrack >= 3)
                                        room.playersNotHitler.add(room.currentCan);
                                    startPresDraw();
                                }
                            } else {
                                incrSkipTrack();
                                room.currentCan = null;
                                room.currentPres = getNextPresSlot();
                                room.specialElection = false;
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
                                startPresAction(enactedCard);
                        }
                    }
                },
                "inspect": (slot, inspectSlot) => {
                    if (room.presAction === "inspect" && room.currentPres === slot && players[inspectSlot]
                        && !room.playersInspected.has(inspectSlot) && slot !== inspectSlot) {
                        players[slot].inspect = {
                            slot: inspectSlot,
                            party: players[inspectSlot].role === "h" ? "f" : players[inspectSlot].role
                        };
                        room.playersInspected.add(inspectSlot);
                        room.whiteBoard.push({
                            type: "inspect",
                            pres: room.currentPres,
                            slot: inspectSlot,
                            claims: ["?"]
                        });
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
                        room.whiteBoard.push({type: "shot", pres: room.currentPres, slot: shootSlot});
                        if (players[shootSlot].role === "h") {
                            const presRole = players[room.currentPres].role;
                            room.partyWin = presRole === "f" ? "l" : presRole;
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
                        room.whiteBoard.push({type: "gives-pres", pres: slot, slot: presSlot});
                        startSelectCan();
                    }
                },
                "inspect-deck-end": (slot) => {
                    if (room.presAction === "inspect-deck" && room.currentPres === slot) {
                        room.presAction = null;
                        state.deck.unshift(...players[room.currentPres].cards.splice(0));
                        room.whiteBoard.push({type: "inspect-deck", pres: room.currentPres, claims: ["?"]});
                        sendStateSlot(room.currentPres);
                        nextPres();
                    }
                },
                "ask-veto": (slot) => {
                    if (room.phase === "can-draw" && room.currentCan === slot && room.vetoActive && room.vetoRequest !== false) {
                        room.vetoRequest = true;
                        update();
                    }
                },
                "accept-veto": (slot, accept) => {
                    if (room.phase === "can-draw" && room.currentPres === slot && room.vetoRequest) {
                        if (accept) {
                            state.discardDeck.push(...players[room.currentCan].cards.splice(0));
                            room.whiteBoard[room.whiteBoard.length - 1].type = "veto";
                            sendStateSlot(room.currentPres);
                            processReshuffle();
                            incrSkipTrack();
                            if (room.partyWin === null)
                                nextPres();
                        } else
                            room.vetoRequest = false;
                        update();
                    }
                },
                "claim": (slot, index, claim) => {
                    const action = room.whiteBoard[index];
                    if (action
                        && (action.pres === slot || action.can === slot)
                        && (action.type === "enact"
                            || (action.type === "inspect" && ["f", "l", "c"].includes(claim))
                            || (action.type === "inspect-deck"
                                && /[FLC]{3}/.match(claim))
                        )
                        && !room.playersShot.has(slot)) {
                        let lastClaim = action.claims[action.claims.length - 1];
                        if (action.type !== "enact" && lastClaim !== claim) {
                            if (action.claims.length > 1)
                                action.reclaimed = true;
                            action.claims.push(claim);
                        } else if (action.type === "enact") {
                            const
                                newClaim = lastClaim.slice(),
                                reclaim = (action.presClaimed && action.pres === slot)
                                    || (action.canClaimed && action.can === slot);
                            if (action.pres === slot) {
                                newClaim[0] = claim.split(">")[0];
                                if (claim.split(">")[1])
                                    newClaim[1] = claim.split(">")[1];
                                else if (claim === "FFF")
                                    newClaim[1] = "FF";
                                else if (claim === "CCC")
                                    newClaim[1] = "CC";
                                else if (claim === "FFL")
                                    newClaim[1] = "FL";
                                else if (claim === "CCL")
                                    newClaim[1] = "CL";
                                else if (claim === "LLL")
                                    newClaim[1] = "LL";
                                action.presClaimed = true;
                            } else if (action.can === slot) {
                                newClaim[2] = claim;
                                action.canClaimed = true;
                            }
                            if (!(lastClaim[0] === newClaim[0]
                                && lastClaim[1] === newClaim[1]
                                && lastClaim[2] === newClaim[2])) {
                                action.claims.push(newClaim);
                                if (reclaim)
                                    action.reclaimed = true;
                            }
                        }
                    }
                    update();
                },
                "test-command": (slot, command) => {
                    if (testMode) {
                        if (room.phase === "voting" && ~["vote-pass", "vote-fail"].indexOf(command))
                            room.activeSlots.forEach((activeSlot) => {
                                if (slot !== activeSlot && !room.playersShot.has(activeSlot))
                                    this.slotEventHandlers.vote(activeSlot, command === "vote-pass");
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
                "tri-team-set": (user, state) => {
                    if (user === room.hostId) {
                        room.triTeam = !!state;
                        update();
                        startGame();
                    }
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
                "toggle-paused": (user) => {
                    if (user === room.hostId) {
                        room.paused = !room.paused;
                        if (!room.paused && room.timeChanged) {
                            room.timeChanged = false;
                            startTimer();
                        }
                    }
                    update();
                },
                "toggle-timed": (user) => {
                    if (user === room.hostId) {
                        room.timed = !room.timed;
                        if (!room.timed) {
                            room.paused = true;
                            clearInterval(timerInterval);
                        } else {
                            if (room.phase !== "idle") {
                                room.paused = false;
                                startTimer();
                            } else room.paused = true;
                        }
                    }
                    update();
                },
                "toggle-tri-team": (user) => {
                    if (user === room.hostId && room.phase === 0)
                        room.triTeam = !room.triTeam;
                    update();
                },
                "set-time": (user, type, value) => {
                    if (user === room.hostId && ~["action", "smallAction"].indexOf(type) && !isNaN(value) && value >= 1) {
                        room[`${type}Time`] = value;
                        room.timeChanged = true;
                    }
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
            this.room.spectators = new JSONSet();
            this.room.onlinePlayers = new JSONSet(this.room.onlinePlayers);
            this.room.playersVoted = new JSONSet(this.room.playersVoted);
            this.room.playersShot = new JSONSet(this.room.playersShot);
            this.room.playersInspected = new JSONSet(this.room.playersInspected);
            this.room.playersNotHitler = new JSONSet(this.room.playersNotHitler);
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