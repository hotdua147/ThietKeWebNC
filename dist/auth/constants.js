"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jwtConstants = void 0;
exports.jwtConstants = {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    expiresIn: '1h',
};
//# sourceMappingURL=constants.js.map