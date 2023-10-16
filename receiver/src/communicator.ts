import { SerialPortStream } from "@serialport/stream";
import CRC32 from "crc-32";

interface Message {
  payload?: Buffer;
  status: "ACK" | "NCK";
  number: number;
}
const ESC_BUFFER = Buffer.from("esc", "utf-8");
const LIM_BUFFER = Buffer.from("lim", "utf-8");

export class Communicator {
  msgs: Array<Message> = [];
  port: SerialPortStream;
  constructor(p: SerialPortStream) {
    this.port = p;
  }

  public handleNewMsg(msg: Buffer) {
    const number = this.getNumber(msg);
    if (this.isMsgOk(msg)) {
      this.sendACK(number);
      this.msgs[number] = {
        number,
        payload: this.getCleanedBody(msg),
        status: "ACK",
      };
    } else {
      this.sendNCK(number);
      this.msgs[number] = {
        number,
        status: "NCK",
        payload: undefined,
      };
    }
  }

  public printWholeMsg() {
    const msg = this.msgs
      .map((m) => m.payload?.toString() ?? "")
      .reduce((p, c) => p + c, "");

    console.log("FULL MESSAGE: ", msg);
  }

  private getNumber(msg: Buffer): number {
    return parseInt(msg.subarray(6, 7).toString());
  }
  private getBodyRaw(msg: Buffer) {
    const bodyRaw = msg.subarray(
      13,
      msg.length - (this.getCRC32Length(msg) + 3)
    );

    return bodyRaw;
  }
  private getCleanedBody(msg: Buffer): Buffer {
    const bodyRaw = this.getBodyRaw(msg);

    //Will store the start for the real body data to build the original
    //message
    const newBodyIdx: Array<number> = [];
    for (let i = 0; i < bodyRaw.length - 3; i += 1) {
      const sub = msg.subarray(i, i + 3);
      const sub2 = msg.subarray(i + 3, i + 6);
      //If i find the secuence escesc or esclim will ignore the first esc

      if (
        sub.equals(ESC_BUFFER) &&
        (sub.equals(sub2) || sub2.equals(LIM_BUFFER))
      ) {
        newBodyIdx.push(i + 3);
        i += 3;
      }
    }
    //Merge the new buffer
    return newBodyIdx.length > 0
      ? this.buildBufferFromIdxs(bodyRaw, newBodyIdx)
      : bodyRaw;
  }
  private buildBufferFromIdxs(original: Buffer, idxs: Array<number>): Buffer {
    const temp: Array<Buffer> = [];

    let start = 0;
    let end = idxs[0];
    for (let i = 0; i < idxs.length; i++) {
      temp.push(original.subarray(start, end));
      start = end;
      end = idxs[i + 1] ?? original.length;
    }

    return Buffer.concat(temp);
  }
  private getCRC32(msg: Buffer) {
    return msg.subarray(msg.length - this.getCRC32Length(msg), msg.length);
  }

  private getCRC32Length(msg: Buffer): 10 | 11 {
    return msg.subarray(msg.length - 11, msg.length).toString()[0] == "-"
      ? 11
      : 10;
  }

  private isMsgOk(msg: Buffer) {
    const originalCRC32 = this.getCRC32(msg);
    const builtCRC32 = this.buildCRC(this.getBodyRaw(msg));
    return originalCRC32.equals(builtCRC32);
  }

  public buildCRC(body: Uint8Array): Buffer {
    return Buffer.from(CRC32.buf(body).toString(), "utf-8");
  }
  private sendACK(n: number) {
    const crc = CRC32.str("ignorebody");
    const frame = Buffer.from(`header${n}ACKlimignorebodylim${crc}\n`);
    console.log("SENT ACK FOR - ", n);
    this.port.write(frame);
  }
  private sendNCK(n: number) {
    const crc = CRC32.str("ignorebody");
    const frame = Buffer.from(`header${n}NCKlimignorebodylim${crc}\n`);
    console.log("SENT NCK FOR - ", n);
    this.port.write(frame);
  }
}
