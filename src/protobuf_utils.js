/**
 * protobuf_utils.js
 *
 * Lightweight, zero-dependency utility class for basic Protobuf serialization and deserialization.
 * Ported from AntigravityManager's src/shared/serialization/protobuf.ts.
 */

'use strict';

class ProtobufUtils {
    static concatBytes(...parts) {
        const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
        const merged = new Uint8Array(totalLength);
        let offset = 0;
        for (const part of parts) {
            merged.set(part, offset);
            offset += part.length;
        }
        return merged;
    }

    static encodeVarint(value) {
        const buf = [];
        let val = BigInt(value);
        while (val >= 128n) {
            buf.push(Number((val & 127n) | 128n));
            val >>= 7n;
        }
        buf.push(Number(val));
        return new Uint8Array(buf);
    }

    static readVarint(data, offset) {
        let result = 0n;
        let shift = 0n;
        let pos = offset;
        while (pos < data.length) {
            const byte = BigInt(data[pos]);
            result |= (byte & 127n) << shift;
            pos++;
            if ((byte & 128n) === 0n) {
                return { value: result, nextOffset: pos };
            }
            shift += 7n;
        }
        throw new Error('Incomplete varint data');
    }

    static skipField(data, offset, wireType) {
        switch (wireType) {
            case 0: // Varint
                return this.readVarint(data, offset).nextOffset;
            case 1: // 64-bit
                return offset + 8;
            case 2: { // Length-delimited
                const { value: length, nextOffset } = this.readVarint(data, offset);
                return nextOffset + Number(length);
            }
            case 5: // 32-bit
                return offset + 4;
            default:
                throw new Error(`Unknown wire type: ${wireType}`);
        }
    }

    static removeField(data, fieldNum) {
        const result = [];
        let offset = 0;
        while (offset < data.length) {
            const startOffset = offset;
            const { value: tag, nextOffset } = this.readVarint(data, offset);
            const wireType = Number(tag & 7n);
            const currentField = Number(tag >> 3n);
            if (currentField === fieldNum) {
                offset = this.skipField(data, nextOffset, wireType);
            } else {
                const endOffset = this.skipField(data, nextOffset, wireType);
                for (let i = startOffset; i < endOffset; i++) {
                    result.push(data[i]);
                }
                offset = endOffset;
            }
        }
        return new Uint8Array(result);
    }

    static createStringField(fieldNum, value) {
        const tag = (fieldNum << 3) | 2;
        const bytes = Buffer.from(value, 'utf-8');
        const tagBytes = this.encodeVarint(tag);
        const lenBytes = this.encodeVarint(bytes.length);
        const result = new Uint8Array(tagBytes.length + lenBytes.length + bytes.length);
        result.set(tagBytes, 0);
        result.set(lenBytes, tagBytes.length);
        result.set(bytes, tagBytes.length + lenBytes.length);
        return result;
    }

    static encodeLenDelimField(fieldNum, data) {
        const tag = (fieldNum << 3) | 2;
        const tagBytes = this.encodeVarint(tag);
        const lenBytes = this.encodeVarint(data.length);
        const result = new Uint8Array(tagBytes.length + lenBytes.length + data.length);
        result.set(tagBytes, 0);
        result.set(lenBytes, tagBytes.length);
        result.set(data, tagBytes.length + lenBytes.length);
        return result;
    }

    static encodeStringField(fieldNum, value) {
        const bytes = Buffer.from(value, 'utf-8');
        return this.encodeLenDelimField(fieldNum, bytes);
    }

    static encodeVarintField(fieldNum, value) {
        const tag = (fieldNum << 3) | 0;
        const tagBytes = this.encodeVarint(tag);
        const valueBytes = this.encodeVarint(value);
        return this.concatBytes(tagBytes, valueBytes);
    }

    static createTimestampField(fieldNum, seconds) {
        const innerTag = (1 << 3) | 0;
        const innerTagBytes = this.encodeVarint(innerTag);
        const secondsBytes = this.encodeVarint(seconds);
        const innerMsg = new Uint8Array(innerTagBytes.length + secondsBytes.length);
        innerMsg.set(innerTagBytes, 0);
        innerMsg.set(secondsBytes, innerTagBytes.length);

        const tag = (fieldNum << 3) | 2;
        const tagBytes = this.encodeVarint(tag);
        const lenBytes = this.encodeVarint(innerMsg.length);
        const result = new Uint8Array(tagBytes.length + lenBytes.length + innerMsg.length);
        result.set(tagBytes, 0);
        result.set(lenBytes, tagBytes.length);
        result.set(innerMsg, tagBytes.length + lenBytes.length);
        return result;
    }

    static getField(data, fieldNum) {
        let offset = 0;
        while (offset < data.length) {
            const { value: tag, nextOffset } = this.readVarint(data, offset);
            const wireType = Number(tag & 7n);
            const currentField = Number(tag >> 3n);
            if (currentField === fieldNum) {
                if (wireType === 2) {
                    const { value: length, nextOffset: dataStart } = this.readVarint(data, nextOffset);
                    return data.slice(dataStart, dataStart + Number(length));
                }
                return null;
            }
            offset = this.skipField(data, nextOffset, wireType);
        }
        return null;
    }

    static readString(data) {
        return Buffer.from(data).toString('utf-8');
    }

    static extractOAuthTokenInfo(data) {
        const field6Data = this.getField(data, 6);
        if (!field6Data) return null;
        const accessTokenBytes = this.getField(field6Data, 1);
        const refreshTokenBytes = this.getField(field6Data, 3);
        const idTokenBytes = this.getField(field6Data, 5);
        if (accessTokenBytes && refreshTokenBytes) {
            return {
                accessToken: this.readString(accessTokenBytes),
                refreshToken: this.readString(refreshTokenBytes),
                idToken: idTokenBytes ? this.readString(idTokenBytes) : undefined,
            };
        }
        return null;
    }

    static createOAuthTokenInfo(accessToken, refreshToken, expiry) {
        const accessTokenField = this.createStringField(1, accessToken);
        const tokenTypeField = this.createStringField(2, 'Bearer');
        const refreshTokenField = this.createStringField(3, refreshToken);
        const expiryField = this.createTimestampField(4, expiry);
        const oauthTokenInfoPayload = this.concatBytes(
            accessTokenField,
            tokenTypeField,
            refreshTokenField,
            expiryField
        );
        const oauthTokenInfoTag = (6 << 3) | 2;
        const tagBytes = this.encodeVarint(oauthTokenInfoTag);
        const lengthBytes = this.encodeVarint(oauthTokenInfoPayload.length);
        const result = new Uint8Array(
            tagBytes.length + lengthBytes.length + oauthTokenInfoPayload.length
        );
        result.set(tagBytes, 0);
        result.set(lengthBytes, tagBytes.length);
        result.set(oauthTokenInfoPayload, tagBytes.length + lengthBytes.length);
        return result;
    }

    static createOAuthInfo(accessToken, refreshToken, expiry, isGcpTos = false, idToken = undefined, email = undefined) {
        let shouldIncludeGcpTosFlag = isGcpTos;
        if (email && this.isPersonalAccountEmail(email) && shouldIncludeGcpTosFlag) {
            shouldIncludeGcpTosFlag = false;
        }
        const accessTokenField = this.encodeStringField(1, accessToken);
        const tokenTypeField = this.encodeStringField(2, 'Bearer');
        const refreshTokenField = this.encodeStringField(3, refreshToken);
        const timestampMsg = this.concatBytes(
            this.encodeVarintField(1, expiry),
            this.encodeVarintField(2, 0)
        );
        const expiryField = this.encodeLenDelimField(4, timestampMsg);
        const idTokenField = idToken ? this.encodeStringField(5, idToken) : new Uint8Array();
        const gcpTosField = shouldIncludeGcpTosFlag ? this.encodeVarintField(6, 1) : new Uint8Array();
        return this.concatBytes(
            accessTokenField,
            tokenTypeField,
            refreshTokenField,
            expiryField,
            idTokenField,
            gcpTosField
        );
    }

    static createUnifiedOAuthToken(accessToken, refreshToken, expiry, isGcpTos = false, idToken = undefined, email = undefined) {
        const oauthInfo = this.createOAuthInfo(
            accessToken,
            refreshToken,
            expiry,
            isGcpTos,
            idToken,
            email
        );
        return this.createUnifiedStateEntry('oauthTokenInfoSentinelKey', oauthInfo);
    }

    static isPersonalAccountEmail(email) {
        const lowerEmail = email.toLowerCase();
        return (
            lowerEmail.endsWith('@gmail.com') ||
            lowerEmail.endsWith('@outlook.com') ||
            lowerEmail.endsWith('@hotmail.com') ||
            lowerEmail.endsWith('@qq.com') ||
            lowerEmail.endsWith('@163.com')
        );
    }

    static createUnifiedStateEntry(sentinelKey, payload) {
        const topic = this.createUnifiedTopicEntry(sentinelKey, payload);
        return Buffer.from(topic).toString('base64');
    }

    static createUnifiedTopicEntry(sentinelKey, payload) {
        const row = this.encodeStringField(1, Buffer.from(payload).toString('base64'));
        const dataEntry = this.concatBytes(
            this.encodeStringField(1, sentinelKey),
            this.encodeLenDelimField(2, row)
        );
        return this.encodeLenDelimField(1, dataEntry);
    }

    static decodeUnifiedStateTopicEntries(topicBlob) {
        const entries = [];
        let offset = 0;
        while (offset < topicBlob.length) {
            const fieldStartOffset = offset;
            const { value: tag, nextOffset } = this.readVarint(topicBlob, offset);
            const wireType = Number(tag & 7n);
            const currentField = Number(tag >> 3n);
            const fieldEndOffset = this.skipField(topicBlob, nextOffset, wireType);
            if (currentField === 1 && wireType === 2) {
                const { value: length, nextOffset: dataStart } = this.readVarint(topicBlob, nextOffset);
                const dataEnd = dataStart + Number(length);
                const dataEntry = topicBlob.slice(dataStart, dataEnd);
                entries.push(this.decodeTopicDataEntry(dataEntry));
            }
            offset = fieldEndOffset;
            if (offset <= fieldStartOffset) {
                throw new Error('Failed to advance while decoding unified topic entries');
            }
        }
        return entries;
    }

    static removeUnifiedTopicEntry(topicBlob, targetSentinelKey) {
        const chunks = [];
        let offset = 0;
        while (offset < topicBlob.length) {
            const fieldStartOffset = offset;
            const { value: tag, nextOffset } = this.readVarint(topicBlob, offset);
            const wireType = Number(tag & 7n);
            const currentField = Number(tag >> 3n);
            const fieldEndOffset = this.skipField(topicBlob, nextOffset, wireType);
            let shouldRemove = false;
            if (currentField === 1 && wireType === 2) {
                const { value: length, nextOffset: dataStart } = this.readVarint(topicBlob, nextOffset);
                const dataEntry = topicBlob.slice(dataStart, dataStart + Number(length));
                shouldRemove = this.getUnifiedTopicEntryKey(dataEntry) === targetSentinelKey;
            }
            if (!shouldRemove) {
                chunks.push(topicBlob.slice(fieldStartOffset, fieldEndOffset));
            }
            offset = fieldEndOffset;
        }
        return this.concatBytes(...chunks);
    }

    static replaceUnifiedTopicEntry(topicBlob, sentinelKey, payload) {
        return this.concatBytes(
            this.removeUnifiedTopicEntry(topicBlob, sentinelKey),
            this.createUnifiedTopicEntry(sentinelKey, payload)
        );
    }

    static decodeTopicDataEntry(dataEntry) {
        const sentinelKeyBytes = this.getField(dataEntry, 1);
        if (!sentinelKeyBytes) {
            throw new Error('Topic data entry key not found');
        }
        const rowBlob = this.getField(dataEntry, 2);
        if (!rowBlob) {
            throw new Error('Topic row not found');
        }
        const encodedPayloadBytes = this.getField(rowBlob, 1);
        if (!encodedPayloadBytes) {
            throw new Error('Topic row value not found');
        }
        return {
            sentinelKey: this.readString(sentinelKeyBytes),
            payload: new Uint8Array(Buffer.from(this.readString(encodedPayloadBytes), 'base64')),
        };
    }

    static getUnifiedTopicEntryKey(dataEntry) {
        const sentinelKeyBytes = this.getField(dataEntry, 1);
        if (!sentinelKeyBytes) {
            return null;
        }
        return this.readString(sentinelKeyBytes);
    }

    static createStringValuePayload(value) {
        return this.encodeStringField(3, value);
    }

    static createMinimalUserStatusPayload(email) {
        return this.concatBytes(this.encodeStringField(3, email), this.encodeStringField(7, email));
    }
}

module.exports = ProtobufUtils;
