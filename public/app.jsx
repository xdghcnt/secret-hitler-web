//import React from "react";
//import ReactDOM from "react-dom"
//import io from "socket.io"
function makeId() {
    let text = "";
    const possible = "abcdefghijklmnopqrstuvwxyz0123456789";

    for (let i = 0; i < 5; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

class Player extends React.Component {
    render() {
        const
            data = this.props.data,
            id = this.props.id,
            game = this.props.game,
            hasPlayer = id !== null;
        return (
            <div className={
                "player"
                + (!~data.onlinePlayers.indexOf(id) ? " offline" : "")
                + (id === data.userId ? " self" : "")
            }
                 data-playerId={id}>
                <div className={`player-name-text bg-color-${this.props.slot}`}>
                    {hasPlayer
                        ? data.playerNames[id]
                        : (data.teamsLocked
                            ? (<div className="slot-empty">Empty</div>)
                            : (<div className="join-slot-button"
                                    onClick={() => game.handlePlayerJoin(this.props.slot)}>Seat</div>))}
                </div>
                {hasPlayer ? (<div className="player-host-controls">
                    {(data.hostId === data.userId && data.userId !== id) ? (
                        <i className="material-icons host-button"
                           title="Give host"
                           onClick={(evt) => game.handleGiveHost(id, evt)}>
                            vpn_key
                        </i>
                    ) : ""}
                    {(data.hostId === data.userId && this.props.isSpectator) ? (
                        <i className="material-icons host-button"
                           title={!~data.blackSlotPlayers.indexOf(id) ? "Give black slot" : "Remove black slot"}
                           onClick={(evt) => game.handleGiveBlackSlot(id, evt)}>
                            {!~data.blackSlotPlayers.indexOf(id) ? "visibility_off" : "visibility"}
                        </i>
                    ) : ""}
                    {(data.hostId === data.userId && data.userId !== id) ? (
                        <i className="material-icons host-button"
                           title="Remove"
                           onClick={(evt) => game.handleRemovePlayer(id, evt)}>
                            delete_forever
                        </i>
                    ) : ""}
                    {(data.hostId === id) ? (
                        <i className="material-icons host-button inactive"
                           title="Host">
                            stars
                        </i>
                    ) : ""}
                </div>) : ""}
            </div>
        );
    }
}

class Spectators extends React.Component {
    render() {
        const data = this.props.data;
        return (
            <div
                onClick={() => this.props.game.handleSpectatorsClick()}
                className="spectators">
                Spectators:
                {
                    data.spectators.length ? data.spectators.map(
                        (player, index) => (<Player key={index} data={data} id={player} isSpectator={true}
                                                    game={this.props.game}/>)
                    ) : " ..."
                }
            </div>
        );
    }
}

class PlayerSlot extends React.Component {
    render() {
        try {
            const
                data = this.props.data,
                slot = this.props.slot,
                game = this.props.game,
                player = data.playerSlots[slot],
                slotData = data.players[slot],
                isOnlyFive = (data.activeSlots.length - data.playersShot.length) <= 5,
                roles = ["unknown", "check", "l", "f", "h", "f1", "f2", "f3", "l1", "l2", "l3", "l4", "l5", "l6"],
                plates = ["pres", "can", "prev-pres", "prev-can"],
                actions = ["", "inspect-deck", "inspect", "election", "shooting", "shooting-veto"],
                voteMarksUp = [],
                voteMarksDown = [];
            data.whiteBoard.forEach((it, index) => {
                if (it.votes) {
                    if (it.type === "skip" && ~it.votes.ja.indexOf(slot))
                        voteMarksUp.push({pres: it.pres, whiteBoardIndex: index});
                    else if (it.type !== "skip" && ~it.votes.nein.indexOf(slot))
                        voteMarksDown.push({pres: it.pres, whiteBoardIndex: index});
                }
            });
            let role, plate;
            if (slotData && slotData.role === "h")
                role = "h";
            else if (data.phase !== "idle" && data.players[data.userSlot] && data.players[data.userSlot].role !== "f"
                && data.players[data.userSlot].inspect && data.players[data.userSlot].inspect.slot === slot)
                role = data.players[data.userSlot].inspect.party;
            else if (slotData) {
                let thatRoleBeforeCount = 1;
                data.playerSlots.forEach((user, userSlot) => {
                    if (userSlot < slot && data.players[userSlot] && data.players[userSlot].role === slotData.role)
                        thatRoleBeforeCount++;
                });
                role = `${slotData.role}${thatRoleBeforeCount}`;
            } else
                role = "unknown";

            if (data.currentPres === slot)
                plate = ["pres"];
            else if (data.presAction === "election" && data.currentPres === data.userSlot && ~data.activeSlots.indexOf(slot))
                plate = ["pres", true];
            else if (data.currentCan === slot)
                plate = ["can"];
            else if (data.prevCan === slot)
                plate = ["prev-can", false, true];
            else if (data.phase === "select-can" && data.currentPres === data.userSlot && ~data.activeSlots.indexOf(slot)
                && !~data.playersShot.indexOf(slot) && (data.prevPres !== slot || isOnlyFive))
                plate = ["can", true];
            else if (data.prevPres === slot && !isOnlyFive)
                plate = ["prev-pres", false, true];
            return (
                <div
                    className={`player-slot ${player !== null ? "" : "no-player"}`
                    + (data.currentPres === slot ? " current-pres" : "")
                    + (data.currentCan === slot ? " current-can" : "")
                    + (data.prevPres === slot ? " prev-press" : "")
                    + (data.prevCan === slot ? " prev-can" : "")
                    + (~data.playersShot.indexOf(slot) ? " shot" : "")
                    + ((!~data.activeSlots.indexOf(slot) && data.teamsLocked && !data.playerSlots[slot]) ? " unoccupied" : "")
                    + ((!~data.activeSlots.indexOf(slot) && data.playerSlots[slot]) ? " inactive" : "")
                    + ` player-slot-${slot}`}>
                    <div className="player-section">
                        <div className={`avatar ${player !== null ? "" : "no-player"}`}
                             style={{
                                 "background-image": player !== null ? `url(/secret-hitler/${data.playerAvatars[player]
                                     ? `avatars/${player}/${data.playerAvatars[player]}.png`
                                     : "default-user.jpg"})` : ""
                             }}>
                            {role !== "unknown"
                                ? (<div className="player-role"
                                        style={{"background-position-x": roles.indexOf(role) * -46}}/>) : ""}
                            {~data.playersNotHitler.indexOf(slot)
                                ? (<div className="not-hitler-card"/>) : ""}
                            {data.phase === "pres-action" && data.currentPres === slot
                                ? (<div className="policy-slot"
                                        style={{"background-position-x": actions.indexOf(data.presAction) * -38.5}}/>) : ""}
                            {(data.presAction === "inspect" && data.currentPres === data.userSlot && slot !== data.userSlot
                                && ~data.activeSlots.indexOf(slot) && !~data.playersInspected.indexOf(slot)
                                && !~data.playersShot.indexOf(slot))
                                ? (<div className="player-role check-button"
                                        onClick={() => game.handleClickInspect(slot)}
                                        style={{"background-position-x": roles.indexOf("check") * -46}}/>) : ""}
                            {player === data.userId
                                ? (<div className="set-avatar-button">
                                    <i onClick={() => game.handleClickSetAvatar()}
                                       className="toggle-theme material-icons">edit</i>
                                </div>)
                                : ""}
                            {(data.presAction === "shooting" && ~data.activeSlots.indexOf(slot)
                                && data.userSlot === data.currentPres && data.userSlot !== slot && !~data.playersShot.indexOf(slot))
                                ? (<div className="shot-button"
                                        onClick={() => game.handleShot(slot)}><i
                                    className="material-icons">my_location</i></div>)
                                : ""}
                        </div>
                        {~data.playersShot.indexOf(slot)
                            ? (<div className="shot-mark"
                                    onClick={() => game.handleShot(slot)}><i
                                className="material-icons">close</i></div>)
                            : ""}
                        <div className="player-name">
                            <Player id={player} data={data} slot={slot} game={game}/>
                        </div>
                    </div>
                    <div className="player-table-section">
                        <div className="vote-marks-section">
                            <div className="vote-marks">
                                {voteMarksDown.length ? (<div className="vote-marks-col">{voteMarksDown.map((it) => (
                                    <i onClick={() => game.toggleWhiteBoardExpanded(it.whiteBoardIndex, slot)}
                                       className={`material-icons vote-mark color-slot-${it.pres}`}>keyboard_arrow_down</i>))}</div>) : ""}
                                {voteMarksUp.length ? (<div className="vote-marks-col">{voteMarksUp.map((it) => (
                                    <i onClick={() => game.toggleWhiteBoardExpanded(it.whiteBoardIndex, slot)}
                                       className={`material-icons vote-mark color-slot-${it.pres}`}>keyboard_arrow_up</i>))}</div>) : ""}
                            </div>
                        </div>
                        <div className="vote-section"
                             style={{
                                 transform: `rotateZ(${data.votesTilt[slot].rotate}deg)`
                                     + `translateX(${data.votesTilt[slot].x}px)`
                                     + `translateY(${data.votesTilt[slot].y}px)`
                             }}>
                            {(data.playersVotes && ~data.playersVoted.indexOf(slot))
                                ? (<div className={`vote-card ${data.playersVotes[slot] ? "ja" : "nein"}`}/>)
                                : (~data.playersVoted.indexOf(slot)
                                    ? (<div className="vote-card"/>) : "")}
                        </div>
                        <div className="plate-section">
                            {plate ? (<div className={`plate ${plate[1] ? "button" : ""} ${plate[2] ? "prev" : ""}`}
                                           onClick={() => plate && plate[1] && game.handleSetPlate(slot)}
                                           style={{"background-position-y": plates.indexOf(plate[0]) * -41}}/>) : ""}
                        </div>
                        <div className="cards-hand">
                            {Array(((data.phase === "pres-draw" || data.presAction === "inspect-deck") && data.currentPres === slot)
                                ? 3 : ((data.phase === "can-draw" && data.currentCan === slot) ? 2 : 0)).fill(null).map(() => (
                                <div className="policy-card"/>))}
                        </div>
                    </div>
                </div>);
        } catch (e) {
            console.error(e);
            debugger;
        }
    }
}

class NoteItem extends React.Component {
    render() {
        try {
            const
                data = this.props.data,
                item = this.props.item,
                game = this.props.game,
                index = this.props.index,
                slotNames = ["Pink", "White", "Brown", "Red", "Orange", "Yellow", "Green", "Teal", "Blue", "Purple"],
                cardTypes = {
                    F: <span className="color-fasc">F</span>,
                    L: <span className="color-lib">L</span>,
                    f: <span className="color-fasc">Fascist</span>,
                    l: <span className="color-lib">Liberal</span>,
                    "?": <span className="color-unknown">?</span>
                },
                arrow = <span className="log-arrow">&gt;</span>,
                colon = <span className="log-colon">:</span>,
                space = <span className="log-space"/>,
                lastLine = item.claims && item.claims[item.claims.length - 1],
                prevLines = item.claims && item.claims.slice(1, item.claims.length - 1),
                getEnactLine = (lineOrig) => {
                    const line = lineOrig && lineOrig.slice();
                    if (line && (line[1] === line[2] || line[1] === "??" || line[2] === "??"))
                        line.splice(1, 1);
                    return <div className="enact-line">
                        <span
                            className={`color-slot-${item.pres} `
                            + `${data.whiteBoardVoteHighlight != null && data.whiteBoardExpanded === index ? "pres-highlight" : ""}`}>
                            {slotNames[item.pres]}
                            </span>{arrow}
                        <span className={`color-slot-${item.can}`}>{slotNames[item.can]}</span>{colon}
                        {item.type === "enact"
                            ? line.map((cards, ind) => [ind ? arrow : "", cards.split("").map((card) => cardTypes[card])])
                            : <span className="color-down">Downvoted</span>}</div>;
                },
                getInspectLine = (line) => {
                    return <div className="inspect-line">
                    <span
                        className={`color-slot-${item.pres}`}>{slotNames[item.pres]}</span>{space}inspects{space}<span
                        className={`color-slot-${item.slot}`}>{slotNames[item.slot]}</span>{colon}{cardTypes[line]}
                    </div>;
                },
                getInspectDeckLine = (line) => {
                    return <div className="inspect-deck-line">
                    <span
                        className={`color-slot-${item.pres}`}>{slotNames[item.pres]}</span>{space}inspects{space}deck{colon}
                        {line.split("").map((card) => cardTypes[card])}
                    </div>;
                },
                getVotesLine = (votesList, downVotesList, title) => {
                    return votesList.length
                        ? <div className="votes-list">{title}{colon}{(votesList.length && downVotesList.length)
                            ? votesList.map((slot) => <span
                                className={`color-slot-${slot} ${data.whiteBoardVoteHighlight === slot ? "pres-highlight-vote" : ""}`}>
                                {slotNames[slot]}{space}</span>)
                            : "All"}</div>
                        : "";
                };
            let
                note = "",
                noteExpanded = "";
            if (item.type === "enact")
                note = getEnactLine(lastLine.slice());
            else if (item.type === "skip")
                note = getEnactLine();
            else if (item.type === "topdeck")
                note = <span>Topdeck{colon}{cardTypes[item.card]}</span>;
            else if (item.type === "reshuffle")
                note = <span>*Reshuffle*</span>;
            else if (item.type === "inspect")
                note = getInspectLine(lastLine);
            else if (item.type === "shot")
                note = <span>
                    <span
                        className={`color-slot-${item.pres}`}>{slotNames[item.pres]}</span>{space}shots{space}<span
                    className={`color-slot-${item.slot}`}>{slotNames[item.slot]}</span>
                </span>;
            else if (item.type === "gives-pres")
                note = <span>
                    <span
                        className={`color-slot-${item.pres}`}>{slotNames[item.pres]}</span>{space}gives{space}pres{space}to{space}
                    <span className={`color-slot-${item.slot}`}>{slotNames[item.slot]}</span>
                </span>;
            else if (item.type === "veto" || item.type === "pre-enact")
                note = <span><span className={`color-slot-${item.pres}`}>{slotNames[item.pres]}</span>{arrow}
                    <span className={`color-slot-${item.can}`}>
                        {slotNames[item.can]}</span>{colon}{item.type === "veto" ? "Veto!" : "Elected"}
                    </span>;
            else if (item.type === "inspect-deck")
                note = getInspectDeckLine(lastLine);
            if (data.whiteBoardExpanded === index)
                if (~["enact", "skip", "veto", "pre-enact"].indexOf(item.type))
                    noteExpanded = <div className="note-expanded">
                        {getVotesLine(item.votes.ja, item.votes.nein, "Ja")}
                        {getVotesLine(item.votes.nein, item.votes.ja, "Nein")}
                        {item.type === "enact" ? prevLines.map(getEnactLine) : ""}
                    </div>;
                else if (item.type === "inspect")
                    noteExpanded = <div className="note-expanded">
                        {prevLines.map(getInspectLine)}
                    </div>;
                else if (item.type === "inspect-deck")
                    noteExpanded = <div className="note-expanded">
                        {prevLines.map(getInspectDeckLine)}
                    </div>;
            return (
                <div className={`note-item ${data.whiteBoardExpanded === index ? "expanded" : ""}`
                + ` ${item.reclaimed ? "reclaimed" : ""}`}>
                    {noteExpanded}
                    {~["enact", "skip", "veto", "pre-enact"].indexOf(item.type)
                    || ~["inspect", "inspect-deck"].indexOf(item.type)
                    && (item.reclaimed || item.pres === data.userSlot) ? (<i
                        className="material-icons note-controls"
                        onClick={() => game.toggleWhiteBoardExpanded(index)}>
                        {data.whiteBoardExpanded !== index ? "add" : "remove"}
                    </i>) : ""}
                    {item.reclaimed ? (<span title="Revised">(R){space}</span>) : ""}
                    <div className="note-text">
                        {note}
                    </div>
                </div>);
        } catch (e) {
            console.error(e);
            debugger;
        }
    }
}

class NoteButtons extends React.Component {
    render() {
        try {
            const
                data = this.props.data,
                game = this.props.game,
                cardTypes = {
                    F: <span className="color-fasc">F</span>,
                    L: <span className="color-lib">L</span>,
                    f: <span className="color-fasc">Fascist</span>,
                    l: <span className="color-lib">Liberal</span>,
                    ">": <span className="log-arrow">&gt;</span>
                };
            let actionIndex, action, isEdit, buttons = [];
            if (data.whiteBoardExpanded != null) {
                actionIndex = data.whiteBoardExpanded;
                action = data.whiteBoard[actionIndex];
                isEdit = true;
                if (!(data.userSlot === action.pres || data.userSlot === action.can))
                    action = null;
            } else
                data.whiteBoard.forEach((it, index) => {
                    if (it.claims
                        && (it.claims.length === 1 || it.type === "enact")
                        && ((data.userSlot === it.pres && it.type !== "enact")
                            || ((data.userSlot === it.pres && !it.presClaimed)
                                || (data.userSlot === it.can && !it.canClaimed
                                    && it.claims[it.claims.length - 1][3] !== "F")))) {
                        action = it;
                        actionIndex = index;
                    }
                });
            if (action && !~data.playersShot.indexOf(data.userSlot))
                if (action.type === "inspect")
                    buttons = ["l", "f"];
                else if (action.type === "inspect-deck")
                    buttons = ["FFF", "FFL", "FLF", "LFF", "FLL", "LFL", "LLF", "LLL"];
                else if (action.type === "enact")
                    if (action.pres === data.userSlot)
                        buttons = {
                            F: ["FFF", "FFL", "FLL>FL"].concat(isEdit ? ["FFL>FF"] : []),
                            L: ["FFL", "FLL>FL", "FLL>LL", "LLL"]
                        }[action.claims[0][3]];
                    else if (action.can === data.userSlot)
                        buttons = {
                            F: ["FF", "FL"],
                            L: ["FL", "LL"]
                        }[action.claims[0][3]];
            return <div className="note-buttons">
                <div
                    className="note-buttons-title">{buttons.length ? (isEdit ? "Edit:" : "Claim:") : ""}</div>
                {buttons.map((it) => (
                    <div className="note-button" onClick={() => game.handleClickClaim(actionIndex, it)}>
                        {it.split("").map((card) => cardTypes[card])}
                    </div>))}
            </div>;
        } catch (e) {
            console.error(e);
            debugger;
        }
    }
}

class Game extends React.Component {
    componentDidMount() {
        const initArgs = {};
        if (!localStorage.secretHitlerUserId || !localStorage.secretHitlerUserToken) {
            while (!localStorage.userName)
                localStorage.userName = prompt("Your name");
            localStorage.secretHitlerUserId = makeId();
            localStorage.secretHitlerUserToken = makeId();
        }
        if (!location.hash)
            history.replaceState(undefined, undefined, "#" + makeId());
        initArgs.avatarId = localStorage.avatarId;
        initArgs.roomId = location.hash.substr(1);
        initArgs.userId = this.userId = localStorage.secretHitlerUserId;
        initArgs.token = this.userToken = localStorage.secretHitlerUserToken;
        initArgs.userName = localStorage.userName;
        this.socket = window.socket.of("secret-hitler");
        this.socket.on("state", (state) => {
            this.processEffects(this.state, state);
            if (this.state.phase === "select-can" && state.phase === "voting")
                this.votesTiltUpdate();
            this.setState(Object.assign(state, {
                userId: this.userId,
                userSlot: ~state.playerSlots.indexOf(this.userId)
                    ? state.playerSlots.indexOf(this.userId)
                    : null,
                players: this.state.players || {},
                cardSelected: this.state.cardSelected,
                whiteBoardExpanded: this.state.whiteBoardExpanded,
                whiteBoardVoteHighlight: this.state.whiteBoardVoteHighlight,
                whiteBoardHidden: this.state.whiteBoardHidden,
                votesTilt: this.state.votesTilt
            }));
        });
        this.socket.on("player-state", (players) => {
            if (players[this.state.userSlot] && players[this.state.userSlot].cards)
                this.state.cardSelected = null;
            this.setState(Object.assign(this.state, {
                players: players
            }));
        });
        window.socket.on("disconnect", (event) => {
            this.setState({
                inited: false,
                disconnected: true,
                disconnectReason: event.reason
            });
        });
        document.title = `Secret Hitler - ${initArgs.roomId}`;
        this.socket.emit("init", initArgs);
        this.socket.on("prompt-delete-prev-room", (roomList) => {
            if (localStorage.acceptDelete =
                prompt(`Limit for hosting rooms per IP was reached: ${roomList.join(", ")}. Delete one of rooms?`, roomList[0]))
                location.reload();
        });
        this.socket.on("ping", (id) => {
            this.socket.emit("pong", id);
        });
        this.socket.on("message", text => {
            popup.alert({content: text});
        });
        this.plateSetSound = new Audio("/secret-hitler/plate-set.wav");
        this.plateSetSound.volume = 0.3;
        this.shotSound = new Audio("/secret-hitler/shot.wav");
        this.dealSound = new Audio("/secret-hitler/deal.mp3");
        this.dealSound.volume = 0.3;
        this.tapSound = new Audio("/secret-hitler/tap.mp3");
        this.tapSound.volume = 0.3;
        this.tapSoundL = new Audio("/secret-hitler/tap_l.ogg");
        this.tapSoundR = new Audio("/secret-hitler/tap_r.ogg");
        this.votesTiltUpdate();
        this.calcSlotCoords();
    }

    calcSlotCoords() {
        this.tableW = 691;
        this.tableH = 397;
        this.slotMap = [
            [0, 1], [1, 0], [2, 0], [3, 0], [4, 1],
            [4, 2], [3, 3], [2, 3], [1, 3], [0, 2]
        ];
        this.slotCoords = this.slotMap
            .map((it) => [Math.round((it[0] / 4) * this.tableW), Math.round((it[1] / 3) * this.tableH)]);
    }

    getSlotCurves(slotA, slotB) {
        const
            a = this.slotMap[slotA],
            b = this.slotMap[slotB],
            aCoords = this.slotCoords[slotA],
            bCoords = this.slotCoords[slotB];
        if (a[0] !== b[0] && ~[a[0], b[0]].indexOf(0) && ~[a[0], b[0]].indexOf(4))
            return {a: [Math.round(this.tableW / 2), aCoords[1]], b: [Math.round(this.tableW / 2), bCoords[1]]};
        else if (a[1] !== b[1] && ~[a[1], b[1]].indexOf(0) && ~[a[1], b[1]].indexOf(3))
            return {a: [aCoords[0], Math.round(this.tableH / 2)], b: [bCoords[0], Math.round(this.tableH / 2)]};
        else if (a[1] === 0 && b[1] === 0)
            return {
                a: [aCoords[0], Math.round(this.tableH / 3) - 20],
                b: [bCoords[0], Math.round(this.tableH / 3) - 20]
            };
        else if (a[1] === 3 && b[1] === 3)
            return {
                a: [aCoords[0], this.tableH - Math.round(this.tableH / 3) + 20],
                b: [bCoords[0], this.tableH - Math.round(this.tableH / 3) + 20]
            };
        else if (a[0] === 0 && b[0] === 0)
            return {
                a: [Math.round(this.tableW / 4) - 30, aCoords[1]],
                b: [Math.round(this.tableW / 4) - 30, bCoords[1]]
            };
        else if (a[0] === 4 && b[0] === 4)
            return {
                a: [this.tableW - Math.round(this.tableW / 4) + 30, aCoords[0]],
                b: [this.tableW - Math.round(this.tableW / 4) + 30, bCoords[0]]
            };
        else {
            const point = [
                ~[0, 4].indexOf(a[0]) ? bCoords[0] : aCoords[0],
                ~[0, 3].indexOf(b[1]) ? aCoords[1] : bCoords[1]
            ];
            return {a: point, b: point};
        }
    }

    votesTiltUpdate() {
        this.state.votesTilt = Array(10).fill().map(() => this.getRandomVoteTilt());
    }

    getRandomVoteTilt() {
        return {
            rotate: Math.floor(Math.random() * 10) - 5,
            x: Math.floor(Math.random() * 10) - 5,
            y: Math.floor(Math.random() * 10) - 5
        }
    }

    processEffects(prev, current) {
        let changedSlot = null;
        if (prev.inited && prev.phase === "voting" && prev.playersVoted.length !== current.playersVoted.length)
            changedSlot = prev.playersVoted.filter(x => !current.playersVoted.includes(x))
                .concat(current.playersVoted.filter(x => !prev.playersVoted.includes(x)))[0];
        if (changedSlot !== null)
            this.state.votesTilt[changedSlot] = this.getRandomVoteTilt();
        if (!this.isMuted() && prev.inited) {
            if (prev.playersShot.length > current.playersShot.length)
                this.plateSetSound.play();
            if (prev.currentPres != current.currentPres || prev.currentCan != current.currentCan)
                this.plateSetSound.play();
            if (prev.presAction === "inspect-deck" && current.phase === "inspect-deck")
                this.dealSound.play();
            if (prev.phase !== "pres-draw" && current.phase === "pres-draw")
                this.dealSound.play();
            else if (prev.phase !== "can-draw" && current.phase === "can-draw")
                this.tapSound.play();
            else if (prev.deckSize < current.deckSize)
                this.dealSound.play();
            else if (prev.fascTrack < current.fascTrack || prev.libTrack < current.libTrack)
                this.tapSound.play();
            else if (changedSlot !== null) {
                const
                    volR = (changedSlot % 5) / 4,
                    volL = 1 - volR;
                this.tapSoundL.volume = Math.max(changedSlot < 5 ? volL : volR, 0.2) * 0.3;
                this.tapSoundR.volume = Math.max(changedSlot < 5 ? volR : volL, 0.2) * 0.3;
                this.tapSoundL.play();
                this.tapSoundR.play();
            }
        }
    }

    constructor() {
        super();
        this.state = {
            inited: false
        };
    }

    handleRemovePlayer(id, evt) {
        evt.stopPropagation();
        popup.confirm({content: `Removing ${this.state.playerNames[id]}?`}, (evt) => evt.proceed && this.socket.emit("remove-player", id));
    }

    handleGiveHost(id, evt) {
        evt.stopPropagation();
        popup.confirm({content: `Give host ${this.state.playerNames[id]}?`}, (evt) => evt.proceed && this.socket.emit("give-host", id));
    }

    handleGiveBlackSlot(id, evt) {
        evt.stopPropagation();
        this.socket.emit("toggle-black-slot", id);
    }

    handleToggleTeamLockClick() {
        this.socket.emit("toggle-lock");
    }

    handleClickTogglePause() {
        if (this.state.phase === "idle" || this.state.libWin !== null || confirm("Game will be aborted. Are you sure?"))
            this.socket.emit("start-game");
    }

    handleToggleMuteSounds() {
        localStorage.muteSounds = !parseInt(localStorage.muteSounds) ? 1 : 0;
        this.setState(Object.assign({}, this.state));
    }

    handleSpectatorsClick() {
        this.socket.emit("spectators-join");
    }

    handleClickChangeName() {
        popup.prompt({content: "New name"}, (evt) => {
            if (evt.proceed && evt.input_value.trim()) {
                this.socket.emit("change-name", evt.input_value);
                localStorage.userName = evt.input_value;
            }
        });
    }

    handleClickSetAvatar() {
        document.getElementById("avatar-input").click();
    }

    handleSetAvatar(event) {
        const input = event.target;
        if (input.files && input.files[0]) {
            const
                file = input.files[0],
                uri = "/secret-hitler/upload-avatar",
                xhr = new XMLHttpRequest(),
                fd = new FormData(),
                fileSize = ((file.size / 1024) / 1024).toFixed(4); // MB
            if (fileSize <= 5) {
                xhr.open("POST", uri, true);
                xhr.onreadystatechange = () => {
                    if (xhr.readyState === 4 && xhr.status === 200) {
                        localStorage.avatarId = xhr.responseText;
                        this.socket.emit("update-avatar", localStorage.avatarId);
                    } else if (xhr.readyState === 4 && xhr.status !== 200) alert("File upload error");
                };
                fd.append("avatar", file);
                fd.append("userId", this.userId);
                fd.append("userToken", this.userToken);
                xhr.send(fd);
            } else
                alert("File shouldn't be larger than 5 MB");
        }
    }

    handlePlayerJoin(slot) {
        this.socket.emit("players-join", slot);
    }

    handleShot(slot) {
        this.socket.emit("shot", slot);
    }

    handleSetPlate(slot) {
        this.socket.emit(this.state.phase === "select-can" ? "set-can" : "set-pres", slot);
    }

    handleClickVote(vote) {
        this.socket.emit("vote", vote);
    }

    handleClickCard(cardInd) {
        this.setState(Object.assign(this.state, {
            cardSelected: this.state.cardSelected === null ? cardInd : null
        }));
    }

    handleClickInspect(slot) {
        this.socket.emit("inspect", slot);
    }

    handleClickOK() {
        if (this.state.presAction === "inspect-deck")
            this.socket.emit("inspect-deck-end");
        else if (this.state.cardSelected !== null)
            this.socket.emit(this.state.currentPres === this.state.userSlot ? "pres-discards" : "can-discards", this.state.cardSelected);
    }

    handleClickVetoRequest() {
        this.socket.emit("ask-veto");
    }

    handleClickVetoAccept(state) {
        this.socket.emit("accept-veto", state);
    }

    handleClickClaim(index, claim) {
        this.toggleWhiteBoardExpanded();
        this.socket.emit("claim", index, claim);
    }

    testCommand(command) {
        this.socket.emit("test-command", command);
    }

    toggleWhiteBoardExpanded(ind, highlightVote) {
        this.setState(Object.assign(this.state, {
            whiteBoardExpanded: (this.state.whiteBoardExpanded === ind && (highlightVote == null || this.state.whiteBoardVoteHighlight === null))
                ? null
                : ind,
            whiteBoardVoteHighlight: (this.state.whiteBoardExpanded === ind
                && this.state.whiteBoardVoteHighlight === highlightVote)
                ? null
                : highlightVote
        }));
    }

    toggleWhiteBoardHidden() {
        this.setState(Object.assign(this.state, {
            whiteBoardExpanded: null,
            whiteBoardVoteHighlight: null,
            whiteBoardHidden: !this.state.whiteBoardHidden
        }));
    }

    debouncedEmit(event, data) {
        clearTimeout(this.debouncedEmitTimer);
        this.debouncedEmitTimer = setTimeout(() => {
            this.socket.emit(event, data);
        }, 500);
    }

    openRules() {
        window.open("/secret-hitler/rules.html", "_blank");
    }

    isMuted() {
        return !!parseInt(localStorage.muteSounds);
    }

    getStatus() {
        const
            data = this.state,
            notEnoughPlayers = data.phase === "idle" && data.playerSlots.filter((slot) => slot !== null).length < 5;
        let status;
        if (data.inited) {
            const
                prevResult = data.libWin === null ? "" : (!data.libWin ? "Fascists win! " : "Liberals win! ");
            if (notEnoughPlayers)
                status = `${prevResult}Not enough players`;
            else if (data.phase === "idle")
                if (data.userId === data.hostId)
                    status = `${prevResult}You can start new game`;
                else
                    status = `${prevResult}Host can start new game`;
            else if (data.phase === "select-can")
                if (data.currentPres === data.userSlot)
                    status = "Choose chancellor";
                else
                    status = "President choosing chancellor";
            else if (data.phase === "voting")
                if (data.userSlot !== null)
                    status = "Place your vote";
                else
                    status = "Voting";
            else if (data.phase === "pres-draw")
                if (data.currentPres === data.userSlot)
                    status = "Discard one policy";
                else
                    status = "Presidents discards policy";
            else if (data.phase === "can-draw" && data.vetoRequest)
                status = "Chancellor asks for veto";
            else if (data.phase === "can-draw")
                if (data.currentCan === data.userSlot)
                    status = "Discard one policy";
                else
                    status = "Chancellor discards policy";
            else if (data.presAction === "inspect-deck")
                if (data.currentPres === data.userSlot)
                    status = "Watch 3 top cards from deck";
                else
                    status = "President watching 3 top cards";
            else if (data.presAction === "inspect")
                if (data.currentPres === data.userSlot)
                    status = "Choose player to inspect";
                else
                    status = "President inspects player";
            else if (data.presAction === "election")
                if (data.currentPres === data.userSlot)
                    status = "Choose next president";
                else
                    status = "President choosing next president";
            else if (data.presAction === "shooting")
                if (data.currentPres === data.userSlot)
                    status = "Choose player to execute";
                else
                    status = "President choosing player to execute";
            else if (data.vetoRequest)
                status = "Chancellor asks for veto";
        }
        return status;
    }

    render() {
        try {
            if (this.state.disconnected)
                return (<div
                    className="kicked">Disconnected{this.state.disconnectReason ? ` (${this.state.disconnectReason})` : ""}</div>);
            else if (this.state.inited) {
                const
                    data = this.state,
                    isHost = data.hostId === data.userId,
                    parentDir = location.pathname.match(/(.+?)\//)[1],
                    userData = data.players && data.players[data.userSlot],
                    slotsCount = data.playerSlots.filter((slot) => slot !== null).length,
                    notEnoughPlayers = data.phase === "idle" && slotsCount < 5,
                    playerVote = data.players[data.userSlot] && data.players[data.userSlot].vote,
                    playerCount = (data.libWin == null && data.phase === "idle") ? slotsCount : data.activeSlots.length,
                    gameType = playerCount < 7 ? "small" : (playerCount < 9 ? "medium" : "large"),
                    actionsOrderF = {
                        small: ["", "", "inspect-deck", "shooting", "shooting-veto", ""],
                        medium: ["", "inspect", "election", "shooting", "shooting-veto", ""],
                        large: ["inspect", "inspect", "election", "shooting", "shooting-veto", ""]
                    }[gameType],
                    actionsOrderL = {
                        small: ["", "", "", "", ""],
                        medium: ["", "", "", "", ""],
                        large: ["", "", "", "", ""]
                    }[gameType],
                    actions = ["", "inspect-deck", "inspect", "election", "shooting", "shooting-veto"],
                    welcomeMessage = <div className="welcome-message">
                        {data.phase === "idle" && data.libWin === null
                            ? (slotsCount >= 5
                                ? `${isHost ? "You" : "Host"} can start ${slotsCount} player game`
                                : "At least 5 players needed")
                            : <span>{data.activeSlots.length} player game started</span>}
                    </div>,
                    arrowList = [];
                data.whiteBoard.forEach((it) => {
                    const lastClaim = it.claims && it.claims[it.claims.length - 1];
                    if (it.type === "enact" && !~lastClaim.indexOf("??") && lastClaim[1] !== lastClaim[2])
                        arrowList.push({
                            type: "fasc",
                            aSlot: it.pres,
                            bSlot: it.can,
                        });
                    else if (it.type === "inspect" && lastClaim !== "?")
                        arrowList.push({
                            type: {l: "lib", f: "fasc"}[lastClaim],
                            aSlot: it.pres,
                            bSlot: it.slot,
                            directed: true
                        });
                });
                arrowList.forEach((it) => {
                    it.a = this.slotCoords[it.aSlot];
                    it.b = this.slotCoords[it.bSlot];
                    it.curves = this.getSlotCurves(it.aSlot, it.bSlot);
                });
                let status = this.getStatus();
                return (
                    <div className={`game`}>
                        <div className={`game-board ${(this.state.inited ? "active" : "")} `
                        + `${(this.state.libWin !== null ? (this.state.libWin ? "lib-win" : "fasc-win") : "")}`}>
                            <div className="game-table">
                                <div className="main-slots top">
                                    {[1, 2, 3].map((it) => (<PlayerSlot data={data} slot={it} game={this}/>))}
                                </div>
                                <div className="middle-row">
                                    <div className="side-slots left">
                                        {[0, 9].map((it) => (<PlayerSlot data={data} slot={it} game={this}/>))}
                                    </div>
                                    <div className="game-table-top">
                                        <svg className="arrows-pane"
                                             xmlns="http://www.w3.org/2000/svg">
                                            <defs>
                                                <marker id="markerArrow-lib" orient="auto-start-reverse"
                                                        markerWidth="10" markerHeight="10" refX="7" refY="4"
                                                        viewBox="0 0 20 20">
                                                    <path d="M0,0 L0,8 L8,4 z" className="color-lib"/>
                                                </marker>
                                                <marker id="markerArrow-fasc" orient="auto-start-reverse"
                                                        markerWidth="10" markerHeight="10" refX="7" refY="4"
                                                        viewBox="0 0 20 20">
                                                    <path d="M0,0 L0,8 L8,4 z" className="color-fasc"/>
                                                </marker>
                                            </defs>
                                            {arrowList.map((it) => (
                                                <path
                                                    d={`M ${it.a[0]} ${it.a[1]} C ${it.curves.a[0]} ${it.curves.a[1]}, `
                                                    + `${it.curves.b[0]} ${it.curves.b[1]}, ${it.b[0]} ${it.b[1]}`}
                                                    markerStart={it.directed ? "" : `url(#markerArrow-${it.type})`}
                                                    markerEnd={`url(#markerArrow-${it.type})`}
                                                    className={`arrow color-${it.type}`}/>
                                            ))}
                                        </svg>
                                        <div className="game-track-section">
                                            <div className={`deck ${data.deckSize > 0 ? "" : "hidden"}`}>
                                                <div className="deck-count">{data.deckSize}</div>
                                                <div className="policy-card"/>
                                            </div>
                                            <div className="game-track">
                                                <div className="fasc-track">
                                                    {[0, 1, 2, 3, 4, 5].map((it) => (
                                                        <div
                                                            className={`policy-slot slot-${it}`}
                                                            style={{"background-position-x": actions.indexOf(actionsOrderF[it]) * -38.5}}>
                                                            {(data.fascTrack >= it + 1) ? (
                                                                <div className="policy-card f"/>) : ""}
                                                        </div>))}
                                                </div>
                                                <div className="lib-track">
                                                    {[0, 1, 2, 3, 4].map((it) => (
                                                        <div
                                                            className={`policy-slot slot-${it}`}
                                                            style={{"background-position-x": actions.indexOf(actionsOrderL[it]) * -38.5}}>
                                                            {(data.libTrack >= it + 1) ? (
                                                                <div className="policy-card l"/>) : ""}
                                                        </div>))}
                                                </div>
                                                <div className="skip-track">
                                                    <div className={`skip-token skip-${data.skipTrack}`}/>
                                                </div>
                                            </div>
                                            <div className={`deck discard ${data.discardSize > 0 ? "" : "hidden"}`}>
                                                <div className="deck-count">{data.discardSize}</div>
                                                <div className="policy-card"/>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="side-slots right">
                                        {[4, 5].map((it) => (<PlayerSlot data={data} slot={it} game={this}/>))}
                                    </div>
                                </div>
                                <div className="main-slots bottom">
                                    {[8, 7, 6].map((it) => (<PlayerSlot data={data} slot={it} game={this}/>))}
                                </div>
                            </div>
                            <div className="hand-section">
                                {userData && !~data.playersShot.indexOf(data.userSlot) && data.phase === "voting" ? (
                                    <div className="vote-cards">
                                        <div onClick={() => this.handleClickVote(false)}
                                             className={"vote-card nein " + (playerVote != null ? (!playerVote ? "selected" : "unselected") : "")}/>
                                        <div
                                            onClick={() => this.handleClickVote(true)}
                                            className={"vote-card ja " + (playerVote != null ? (playerVote ? "selected" : "unselected") : "")}/>
                                    </div>) : (userData && userData.cards ? "" : "")}
                                {userData && userData.cards ? (<div className="policy-cards">
                                    {userData.cards.map((card, index) => (
                                        <div
                                            onClick={() => data.phase !== "pres-action" && this.handleClickCard(index)}
                                            className={`policy-card ${card} `
                                            + `${data.cardSelected !== null ? (data.cardSelected === index ? "selected" : "unselected") : ""}`}/>))}
                                </div>) : ""}
                                {userData && userData.cards && userData.cards.length
                                    ? (<i onClick={() => this.handleClickOK()}
                                          className="material-icons accept-button">
                                        check
                                    </i>) : ""}
                                {data.phase === "can-draw" && data.vetoActive && data.userSlot === data.currentCan
                                && data.vetoRequest === null
                                    ? (<i onClick={() => this.handleClickVetoRequest()}
                                          className="accept-button veto">
                                        Veto?
                                    </i>) : ""}
                                {data.vetoRequest && data.userSlot === data.currentPres
                                    ? (<i onClick={() => this.handleClickVetoAccept(true)}
                                          className="accept-button veto">
                                        Veto!
                                    </i>) : ""}
                                {data.vetoRequest && data.userSlot === data.currentPres
                                    ? (<i onClick={() => this.handleClickVetoAccept(false)}
                                          className="accept-button veto">
                                        No...
                                    </i>) : ""}
                            </div>
                            <div className={`notes ${this.state.whiteBoardHidden ? "hidden" : ""}`}>
                                <div className={`note-list ${data.whiteBoardExpanded != null ? "expanded" : ""}`}>
                                    {welcomeMessage}
                                    {data.whiteBoard.map((it, ind) =>
                                        (<NoteItem item={it} data={data} game={this} index={ind}/>))}
                                    {data.libWin !== null ? (
                                        <div><span className={`color-${data.libWin ? "lib" : "fasc"}`}>
                                            {data.libWin ? "Liberals" : "Fascists"}</span> wins!
                                        </div>) : ""}
                                </div>
                                <div className="notes-footer">
                                    <i
                                        className="material-icons notes-hide"
                                        onClick={() => this.toggleWhiteBoardHidden()}>
                                        {this.state.whiteBoardHidden ? "add" : "remove"}
                                    </i>
                                    <NoteButtons data={data} game={this}/>
                                </div>
                            </div>
                            <div className="help-panel">
                                <i onClick={() => this.showHelp()}
                                   className="material-icons">help</i>
                                <div className="status-message">{status}</div>
                            </div>
                            <div className="win-banners">
                                <div className="banner left"/>
                                <div className="banner right"/>
                            </div>
                            <div className={
                                "spectators-section"
                                + ((data.spectators.length > 0 || !data.teamsLocked) ? " active" : "")
                            }>
                                <Spectators data={this.state}
                                            game={this}/>
                            </div>
                            <div className="host-controls">
                                <div className="side-buttons">
                                    <i onClick={() => window.location = parentDir}
                                       className="material-icons exit settings-button">exit_to_app</i>
                                    <i onClick={() => this.openRules()}
                                       className="material-icons settings-button">help_outline</i>
                                    {isHost ? (data.teamsLocked
                                        ? (<i onClick={() => this.handleToggleTeamLockClick()}
                                              className="material-icons start-game settings-button">lock_outline</i>)
                                        : (<i onClick={() => this.handleToggleTeamLockClick()}
                                              className="material-icons start-game settings-button">lock_open</i>)) : ""}
                                    {isHost ? ((data.phase === "idle" && data.libWin == null)
                                        ? (<i onClick={() => this.handleClickTogglePause()}
                                              title={notEnoughPlayers ? "Not enough players" : ""}
                                              className={`material-icons start-game settings-button ${notEnoughPlayers
                                                  ? "inactive" : ""}`}>play_arrow</i>)
                                        : (<i onClick={() => this.handleClickTogglePause()}
                                              className="material-icons start-game settings-button">sync</i>)) : ""}
                                    <i onClick={() => this.handleClickChangeName()}
                                       className="toggle-theme material-icons settings-button">edit</i>
                                    {!this.isMuted()
                                        ? (<i onClick={() => this.handleToggleMuteSounds()}
                                              className="toggle-theme material-icons settings-button">volume_up</i>)
                                        : (<i onClick={() => this.handleToggleMuteSounds()}
                                              className="toggle-theme material-icons settings-button">volume_off</i>)}
                                    {data.testMode ? (
                                        <i className="settings-hover-button material-icons settings-button"
                                           onClick={() => this.testCommand("vote-pass")}>check</i>) : ""}
                                    {data.testMode ? (
                                        <i className="settings-hover-button material-icons settings-button"
                                           onClick={() => this.testCommand("vote-fail")}>close</i>) : ""}
                                </div>
                                <i className="settings-hover-button material-icons">settings</i>
                                <input id="avatar-input" type="file" onChange={evt => this.handleSetAvatar(evt)}/>
                            </div>
                        </div>
                    </div>
                );
            } else return (<div/>);
        } catch (error) {
            console.error(error);
            debugger;
            return (<div
                className="kicked">{`Client error: ${error.message}`}</div>);
        }
    }
}

ReactDOM.render(<Game/>, document.getElementById("root"));
