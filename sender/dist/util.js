"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = void 0;
function sleep(ms = 100) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
exports.sleep = sleep;
//# sourceMappingURL=util.js.map