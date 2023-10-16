"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Communicator = void 0;
const crc_32_1 = __importDefault(require("crc-32"));
const ESC_BUFFER = Buffer.from("esc", "utf-8");
const LIM_BUFFER = Buffer.from("lim", "utf-8");
class Communicator {
    constructor(p) {
        this.msgs = [];
        this.port = p;
    }
    handleNewMsg(msg) {
        const number = this.getNumber(msg);
        if (this.isMsgOk(msg)) {
            this.sendACK(number);
            this.msgs[number] = {
                number,
                payload: this.getCleanedBody(msg),
                status: "ACK",
            };
        }
        else {
            console.log("RAW: \t", this.getBodyRaw(msg).toString());
            console.log("CLEANED: \t", this.getCleanedBody(msg).toString());
            this.sendNCK(number);
            this.msgs[number] = {
                number,
                status: "NCK",
                payload: undefined,
            };
        }
    }
    printWholeMsg() {
        const msg = this.msgs
            .map((m) => { var _a, _b; return (_b = (_a = m.payload) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : ""; })
            .reduce((p, c) => p + c, "");
        console.log("FULL MESSAGE: ", msg);
    }
    getNumber(msg) {
        return parseInt(msg.subarray(6, 7).toString());
    }
    getBodyRaw(msg) {
        const bodyRaw = msg.subarray(13, msg.length - (this.getCRC32Length(msg) + 3));
        return bodyRaw;
    }
    getCleanedBody(msg) {
        const bodyRaw = this.getBodyRaw(msg);
        const newBodyIdx = [];
        for (let i = 0; i < bodyRaw.length - 3; i += 1) {
            const sub = msg.subarray(i, i + 3);
            const sub2 = msg.subarray(i + 3, i + 6);
            if (sub.equals(ESC_BUFFER) &&
                (sub.equals(sub2) || sub2.equals(LIM_BUFFER))) {
                newBodyIdx.push(i + 3);
                i += 3;
            }
        }
        return newBodyIdx.length > 0
            ? this.buildBufferFromIdxs(bodyRaw, newBodyIdx)
            : bodyRaw;
    }
    buildBufferFromIdxs(original, idxs) {
        var _a;
        const temp = [];
        let start = 0;
        let end = idxs[0];
        for (let i = 0; i < idxs.length; i++) {
            temp.push(original.subarray(start, end));
            start = end;
            end = (_a = idxs[i + 1]) !== null && _a !== void 0 ? _a : original.length;
        }
        return Buffer.concat(temp);
    }
    getCRC32(msg) {
        return msg.subarray(msg.length - this.getCRC32Length(msg), msg.length);
    }
    getCRC32Length(msg) {
        return msg.subarray(msg.length - 11, msg.length).toString()[0] == "-"
            ? 11
            : 10;
    }
    isMsgOk(msg) {
        const originalCRC32 = this.getCRC32(msg);
        const builtCRC32 = this.buildCRC(this.getBodyRaw(msg));
        return originalCRC32.equals(builtCRC32);
    }
    buildCRC(body) {
        return Buffer.from(crc_32_1.default.buf(body).toString(), "utf-8");
    }
    sendACK(n) {
        const crc = crc_32_1.default.str("ignorebody");
        const frame = Buffer.from(`header${n}ACKlimignorebodylim${crc}\n`);
        console.log("SENT ACK FOR - ", n);
        this.port.write(frame);
    }
    sendNCK(n) {
        const crc = crc_32_1.default.str("ignorebody");
        const frame = Buffer.from(`header${n}NCKlimignorebodylim${crc}\n`);
        console.log("SENT NCK FOR - ", n);
        this.port.write(frame);
    }
}
exports.Communicator = Communicator;
//# sourceMappingURL=communicator.js.map