/*
All the logic uses buffers because it makes it easier to move the 
lower api to another system. Despite of serialport supporting strings
and building the buffer underline
*/

//!todo: ATM esc strings are not allowed, all the parsing in the
//!receiver is done by CRC32 length and some hardcoded magic.
//!The main problem to solve to allow it again:
//! - Dont split messages in the middle of a string escesc or esclim (A lot of parsing to handle)

import { SerialPortStream } from "@serialport/stream";
import CRC32 from "crc-32";

import { ReadlineParser } from "serialport";
import { sleep } from "./util";

// const MAX_BODY_SIZE = 64 * 1000; //64 KB
const MAX_BODY_SIZE = 20; //64 KB
const MSG_TIMEOUT = 1000; // 10 seconds
const ESC_BUFFER = Buffer.from("esc", "utf-8");
const LIM_BUFFER = Buffer.from("lim", "utf-8");
const MAX_ITER = 1000;
interface Message {
  payload: Buffer;
  status: "ACK" | "NCK" | "WAITING";
  timestamp?: number;
  number: number;
}

export class Comunicator {
  parser: ReadlineParser;
  //This kind of DI, makes it easier to replace the serial port
  //With another L1 handler
  port: SerialPortStream;
  messages: Array<Message> = [];
  //This works as a priority queue of messages to send.
  //On every NACK message received or message sent timed-out
  //An old message will be pushed to the top of the queue
  //Working with the index of the messages buffers makes it easier
  //to re-send failed or timedout messages. I just have to check
  //for the messages in the original array and set it back here with
  //the highest prio (At the top)
  msgToSend: Array<number> = [];
  //This is used for testing purpouses
  possibleFailure: boolean;

  constructor(port: SerialPortStream, possibleFailure: boolean = false) {
    this.parser = new ReadlineParser();
    this.port = port;
    this.possibleFailure = possibleFailure;
  }

  //Will receive response and set ACK or NCK for messages
  public handleResponse(msg: Buffer) {
    const msgNumber = this.getNumber(msg);
    console.log("RESPONDED", msgNumber, this.getMode(msg));
    if (this.getMode(msg) != "ACK") {
      this.msgToSend.unshift(msgNumber);
      this.messages[msgNumber].status = "NCK";
    } else {
      this.messages[msgNumber].status = "ACK";
    }
  }

  //Msg is UTF-8, therefore each **letter** is 1byte
  //Dont try to send weird things
  public async sendMessage(msg: string) {
    this.buildMessagesToSend(msg);
    let iterNumber = 0; //Security checks
    console.log(
      "LENGTHS: ",
      this.messages.length,
      this.msgToSend.length,
      this.messages.filter((m) => m.status != "ACK")
    );
    while (iterNumber < MAX_ITER) {
      this.handleTimeouts();
      const nextMsg = this.getNextMsgToSend();

      if (!nextMsg) {
        iterNumber++;
        // await sleep(100);
        continue;
      }
      console.log(this.messages.filter((m) => m.status != "ACK").length);
      const frame = this.buildFrame(nextMsg, nextMsg.number);
      this.messages[nextMsg.number].timestamp = new Date().getTime();
      this.port.write(frame, "utf-8");
      //This makes blocking the write operation
      this.port.drain();

      console.log(
        "SENT MSG: ",
        nextMsg.number,
        nextMsg.payload.toString(),
        new Date().getTime()
      );
      await sleep(90);
      iterNumber++;
    }
    //Force GC
    //@ts-ignore
    // this.messages = null;

    console.log("SENT AL MESSAGES");
    // this.port.close();
  }

  //This returns the actual bytes secuence to be sent
  private buildFrame(m: Message, msgNumber: number) {
    //The current serial ports uses strings

    //Frame format (WO Whitespaces)
    //The idea of a fixed length header is to make it easier
    //to parse the message mode
    //In case of mode == ACK | NCK => Body empty / ignored
    //"header" <SEN | ACK | NCK> <number> "lim" <body?> "lim" <CRC32(body)>
    return Buffer.concat([
      this.buildHeader(msgNumber),
      Buffer.from("SEN", "utf-8"),
      Buffer.from(LIM_BUFFER),
      m.payload,
      Buffer.from(LIM_BUFFER),
      this.buildCRC(m.payload),
      Buffer.from("\n", "utf-8"), //WIthout this, the buffer is not sent
    ]);
  }

  //If there is some message that has been timeouted
  //It will added to the head of the queue
  private handleTimeouts() {
    const currTime = new Date().getTime();
    this.messages.forEach((m, idx) => {
      if (
        m.timestamp &&
        m.timestamp < currTime - MSG_TIMEOUT &&
        m.status != "ACK"
      ) {
        this.msgToSend.unshift(idx);
      }
    });
  }

  private getNextMsgToSend(): Message | undefined {
    const nextIdx = this.msgToSend.shift();
    if (nextIdx == undefined || nextIdx == null) return;

    return this.messages[nextIdx];
  }

  /*Creates the new messages and push them to the head of the queue
  The idea is to give the possibility to call multiple times sendMessage
  for the same Comunicator instance */
  private buildMessagesToSend(msg: string) {
    const temp: Buffer = Buffer.from(msg, "utf-8");
    const bfr = this.addScapeSymbols(temp);
    let tempBuffers = [bfr];
    if (temp.byteLength > MAX_BODY_SIZE) {
      console.log("TO SEPARATE");
      tempBuffers = this.separateItoSmallerBuffers(bfr);
    }
    this.buildMsgsFromBuffers(tempBuffers);
  }

  private buildMsgsFromBuffers(bfrs: Array<Buffer>) {
    bfrs.forEach((b, idx) => {
      this.messages[idx] = {
        payload: b,
        status: "WAITING",
        number: idx,
      };
      //Add the new msg to send
      this.msgToSend.push(idx);
    });
  }

  //If the size of the data with scape characters > MAX_BODY_SIZE
  //will send multiples frames
  private separateItoSmallerBuffers(original: Buffer): Array<Buffer> {
    let msgs: Array<Buffer> = [];

    let start = 0;
    let end = MAX_BODY_SIZE;

    //Will add N or N-1 packages with MAX_BODY_SIZE
    while (end < original.byteLength) {
      msgs.push(Buffer.from(original.subarray(start, end)));
      start = end;
      end += MAX_BODY_SIZE;
    }

    //If original.bytesize % MAX_BODY_SIZE != 0 => There is one last
    //package with size < MAX_BODY_SIZE to add
    if (start < original.byteLength) {
      msgs.push(Buffer.from(original.subarray(start)));
    }

    return msgs;
  }

  //The data portion is limited by a codes of 3 bytes
  //lim -> \x6c\x69\x6d
  //To avoid limit codes in the middle of the payload, esc code is added
  //esc -> \x101\x115\x99
  //And to avoid the possible existence of the esc code in the middle
  //of the original data, an extra esc code is added before it
  //(To avoid ignoring the origial)
  private addScapeSymbols(msg: Buffer) {
    //Store all the index where will be inserted later on
    let idxs: Array<number> = [];

    for (let i = 0; i < msg.length - 3; i++) {
      const sub = msg.subarray(i, i + 3);

      if (sub.equals(ESC_BUFFER) || sub.equals(LIM_BUFFER)) {
        idxs.push(i);
      }
    }

    return msg;
    // return idxs.length > 0 ? this.insertToBuffer(idxs, msg) : msg;
  }

  // private insertToBuffer(position: Array<number>, b: Buffer): Buffer {
  //   //This is extremly inefficient, because there are a lot of
  //   //allocations, but is easier to check
  //   //It wont be optimized, just embrace it

  //   //If there is some match, we will need at least one esc buffer in the beginning
  //   //Imagine the case of the message escsome message
  //   //The idea is to have escescsome message to avoid ignoring the
  //   //original esc substring
  //   const subBuffers: Array<Buffer> = [];

  //   //The new buffer will have enough room for the old one and the N
  //   //ESC chars
  //   for (let i = 0; i < position.length; i++) {
  //     subBuffers.push(Buffer.from(ESC_BUFFER));
  //     subBuffers.push(Buffer.from(b.subarray(position[i], position[i + 1])));
  //   }

  //   // subBuffers.forEach((b) => console.log(b.toString()));
  //   return Buffer.concat(subBuffers);
  // }
  public buildCRC(body: Uint8Array): Buffer {
    return Math.random() > 0.5 && this.possibleFailure
      ? Buffer.from(CRC32.buf(body).toString(), "utf-8")
      : Buffer.from("0", "utf-8");
  }

  public buildHeader(number: number): Buffer {
    return Buffer.from(`header${number}`, "utf-8");
  }

  private getNumber(msg: Buffer): number {
    return parseInt(msg.subarray(6, 7).toString());
  }

  private getMode(msg: Buffer) {
    return msg.subarray(7, 10).toString();
  }
}
