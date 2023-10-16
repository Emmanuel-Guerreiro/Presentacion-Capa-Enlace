"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const parser_readline_1 = require("@serialport/parser-readline");
const stream_1 = require("@serialport/stream");
const serialport_1 = require("serialport");
const communicator_1 = require("./communicator");
const port = new stream_1.SerialPortStream({
    binding: serialport_1.SerialPort.binding,
    path: "/dev/pts/2",
    baudRate: 14400,
});
const parser = new parser_readline_1.ReadlineParser();
const comm = new communicator_1.Communicator(port);
port.on("open", () => {
    console.log("Started receiver | Will close in 20 secs");
    setTimeout(() => port.close(), 5000);
});
port.on("close", () => {
    comm.printWholeMsg();
});
port.pipe(parser).on("data", (line) => {
    const msgBuffer = Buffer.from(line, "utf-8");
    comm.handleNewMsg(msgBuffer);
});
//# sourceMappingURL=index.js.map