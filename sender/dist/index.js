"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const parser_readline_1 = require("@serialport/parser-readline");
const stream_1 = require("@serialport/stream");
const serialport_1 = require("serialport");
const comunicator_1 = require("./comunicator");
const port = new stream_1.SerialPortStream({
    binding: serialport_1.SerialPort.binding,
    path: "/dev/pts/3",
    baudRate: 14400,
});
const comm = new comunicator_1.Comunicator(port, true);
const parser = new parser_readline_1.ReadlineParser();
port.on("open", () => {
    console.log("Started connection");
    console.log("-------------------");
    comm.sendMessage("lorem ipsum dolor sit amet consectetur adipiscing elit Vestibulum tincidunt quis dui eu consequat. Maecenas faucibus, turpis at faucibus ornare, enim mauris accumsan mi, quis faucibus neque metus eget erat. Praesent ut efficitur lectus, elementum mollis orci.");
});
port.pipe(parser).on("data", (line) => {
    const msgBuffer = Buffer.from(line, "utf-8");
    comm.handleResponse(msgBuffer);
});
port.on("close", () => {
    console.log("CLOSING SESSION");
});
//# sourceMappingURL=index.js.map