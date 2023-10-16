import { ReadlineParser } from "@serialport/parser-readline";
import { SerialPortStream } from "@serialport/stream";
import { SerialPort } from "serialport";
import { Comunicator } from "./comunicator";

const port = new SerialPortStream({
  binding: SerialPort.binding,
  path: "/dev/pts/3",
  baudRate: 14400,
});

const comm = new Comunicator(port, true);

const parser = new ReadlineParser();
//@ts-ignore

// wait for port to open...
// @ts-ignore
port.on("open", () => {
  console.log("Started connection");
  console.log("-------------------");
  comm.sendMessage(
    "lorem ipsum dolor sit amet consectetur adipiscing elit Vestibulum tincidunt quis dui eu consequat. Maecenas faucibus, turpis at faucibus ornare, enim mauris accumsan mi, quis faucibus neque metus eget erat. Praesent ut efficitur lectus, elementum mollis orci."
  );
});

port.pipe(parser).on("data", (line) => {
  const msgBuffer = Buffer.from(line, "utf-8");
  comm.handleResponse(msgBuffer);
});

port.on("close", () => {
  console.log("CLOSING SESSION");
});
