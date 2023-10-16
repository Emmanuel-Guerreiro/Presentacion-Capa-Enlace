"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Comunicator = void 0;
const crc_32_1 = __importDefault(require("crc-32"));
const serialport_1 = require("serialport");
const util_1 = require("./util");
const MAX_BODY_SIZE = 20;
const MSG_TIMEOUT = 1000;
const ESC_BUFFER = Buffer.from("esc", "utf-8");
const LIM_BUFFER = Buffer.from("lim", "utf-8");
const MAX_ITER = 1000;
class Comunicator {
    constructor(port, possibleFailure = false) {
        this.messages = [];
        this.msgToSend = [];
        this.parser = new serialport_1.ReadlineParser();
        this.port = port;
        this.possibleFailure = possibleFailure;
    }
    handleResponse(msg) {
        const msgNumber = this.getNumber(msg);
        console.log("RESPONDED", msgNumber, this.getMode(msg));
        if (this.getMode(msg) != "ACK") {
            this.msgToSend.unshift(msgNumber);
            this.messages[msgNumber].status = "NCK";
        }
        else {
            this.messages[msgNumber].status = "ACK";
        }
    }
    sendMessage(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            this.buildMessagesToSend(msg);
            let iterNumber = 0;
            console.log("LENGTHS: ", this.messages.length, this.msgToSend.length, this.messages.filter((m) => m.status != "ACK"));
            while (iterNumber < MAX_ITER) {
                this.handleTimeouts();
                const nextMsg = this.getNextMsgToSend();
                if (!nextMsg) {
                    iterNumber++;
                    continue;
                }
                console.log(this.messages.filter((m) => m.status != "ACK").length);
                const frame = this.buildFrame(nextMsg, nextMsg.number);
                this.messages[nextMsg.number].timestamp = new Date().getTime();
                this.port.write(frame, "utf-8");
                this.port.drain();
                console.log("SENT MSG: ", nextMsg.number, nextMsg.payload.toString(), new Date().getTime());
                yield (0, util_1.sleep)(90);
                iterNumber++;
            }
            console.log("SENT AL MESSAGES");
        });
    }
    buildFrame(m, msgNumber) {
        return Buffer.concat([
            this.buildHeader(msgNumber),
            Buffer.from("SEN", "utf-8"),
            Buffer.from(LIM_BUFFER),
            m.payload,
            Buffer.from(LIM_BUFFER),
            this.buildCRC(m.payload),
            Buffer.from("\n", "utf-8"),
        ]);
    }
    handleTimeouts() {
        const currTime = new Date().getTime();
        this.messages.forEach((m, idx) => {
            if (m.timestamp &&
                m.timestamp < currTime - MSG_TIMEOUT &&
                m.status != "ACK") {
                this.msgToSend.unshift(idx);
            }
        });
    }
    getNextMsgToSend() {
        const nextIdx = this.msgToSend.shift();
        if (nextIdx == undefined || nextIdx == null)
            return;
        return this.messages[nextIdx];
    }
    buildMessagesToSend(msg) {
        const temp = Buffer.from(msg, "utf-8");
        const bfr = this.addScapeSymbols(temp);
        let tempBuffers = [bfr];
        if (temp.byteLength > MAX_BODY_SIZE) {
            console.log("TO SEPARATE");
            tempBuffers = this.separateItoSmallerBuffers(bfr);
        }
        this.buildMsgsFromBuffers(tempBuffers);
    }
    buildMsgsFromBuffers(bfrs) {
        bfrs.forEach((b, idx) => {
            this.messages[idx] = {
                payload: b,
                status: "WAITING",
                number: idx,
            };
            this.msgToSend.push(idx);
        });
    }
    separateItoSmallerBuffers(original) {
        let msgs = [];
        let start = 0;
        let end = MAX_BODY_SIZE;
        while (end < original.byteLength) {
            msgs.push(Buffer.from(original.subarray(start, end)));
            start = end;
            end += MAX_BODY_SIZE;
        }
        if (start < original.byteLength) {
            msgs.push(Buffer.from(original.subarray(start)));
        }
        return msgs;
    }
    addScapeSymbols(msg) {
        let idxs = [];
        for (let i = 0; i < msg.length - 3; i++) {
            const sub = msg.subarray(i, i + 3);
            if (sub.equals(ESC_BUFFER) || sub.equals(LIM_BUFFER)) {
                idxs.push(i);
            }
        }
        return msg;
    }
    buildCRC(body) {
        return Math.random() > 0.5 && this.possibleFailure
            ? Buffer.from(crc_32_1.default.buf(body).toString(), "utf-8")
            : Buffer.from("0", "utf-8");
    }
    buildHeader(number) {
        return Buffer.from(`header${number}`, "utf-8");
    }
    getNumber(msg) {
        return parseInt(msg.subarray(6, 7).toString());
    }
    getMode(msg) {
        return msg.subarray(7, 10).toString();
    }
}
exports.Comunicator = Comunicator;
//# sourceMappingURL=comunicator.js.map