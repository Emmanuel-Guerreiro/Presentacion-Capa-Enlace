import { ReadlineParser } from "@serialport/parser-readline";
import { SerialPortStream } from "@serialport/stream";
import { SerialPort } from "serialport";
import { Communicator } from "./communicator";

// Create a port and enable the echo and recording.
// MockBinding.createPort("/dev/pts/3", { echo: true, record: true });

const port = new SerialPortStream({
  binding: SerialPort.binding,
  path: "/dev/pts/2",
  baudRate: 14400,
});

/* Add some action for incoming data. For example,
 ** print each incoming line in uppercase */
const parser = new ReadlineParser();
const comm = new Communicator(port);

port.on("open", () => {
  console.log("Started receiver | Will close in 20 secs");
  setTimeout(() => port.close(), 5000);
});

port.on("close", () => {
  comm.printWholeMsg();
});

//@ts-ignore
port.pipe(parser).on("data", (line) => {
  //The sender will send a string (thats what we stablished over there)
  //But the idea is to handle a buffer
  // const decoder = new TextDecoder();

  const msgBuffer = Buffer.from(line, "utf-8");
  comm.handleNewMsg(msgBuffer);
});
