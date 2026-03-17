import aesjs from "aes-js";
import { BitstreamReader, BitstreamWriter } from "@astronautlabs/bitstream";

export const MOYU_SERVICE_UUID = "0783b03e-7735-b5a0-1760-a305d2795cb0";
export const MOYU_READ_CHAR_UUID = "0783b03e-7735-b5a0-1760-a305d2795cb1";
export const MOYU_WRITE_CHAR_UUID = "0783b03e-7735-b5a0-1760-a305d2795cb2";

const KEY = new Uint8Array([
21,119,58,92,103,14,45,31,
23,103,42,19,155,103,82,87
]);

const IV = new Uint8Array([
17,35,38,37,134,42,44,59,
85,6,127,49,126,103,33,87
]);

function createUint8ArrayStream(targetBuffer){
let offset=0;
return{
write(chunk){
if(chunk instanceof ArrayBuffer){
chunk=new Uint8Array(chunk);
}else if(ArrayBuffer.isView(chunk)){
chunk=new Uint8Array(chunk.buffer,chunk.byteOffset,chunk.byteLength);
}else{
throw new TypeError("Chunk must be ArrayBuffer or TypedArray");
}
if(offset+chunk.byteLength>targetBuffer.byteLength){
throw new Error("Buffer overflow");
}
targetBuffer.set(chunk,offset);
offset+=chunk.byteLength;
}
};
}

function readComplexSignedSync(streamRdr,bitLength){
const sign=streamRdr.readSync(1)===1?-1:1;
const value=streamRdr.readSync(bitLength-1);
if(bitLength%8!==0)return 0;
let tValue=0;
for(let l=0;l<bitLength/8;l++){
const mesh=255<<(l*8);
const t=(value&mesh)>>(l*8);
tValue=(tValue<<8)+t;
}
return sign*tValue;
}

function padTo20Bytes(packet){
if(packet.length>=20)return packet;
const padded=new Uint8Array(20);
padded.set(packet);
for(let i=packet.length;i<20;i++)padded[i]=0;
return padded;
}

function createCrypter(){

let rawKey=null;
let rawIvKey=null;
let key=new Uint8Array(16);
let ivKey=new Uint8Array(16);
let salt=null;

function updateKey(){
if(rawKey===null||rawIvKey===null)return;
key=new Uint8Array(rawKey);
ivKey=new Uint8Array(rawIvKey);
if(salt!==null){
for(let i=0;i<6;i++){
const saltValue=salt[5-i];
key[i]=(key[i]+saltValue)%255;
ivKey[i]=(ivKey[i]+saltValue)%255;
}
}
}

function processBlock(data,offset,encryptMode){
const block=data.slice(offset,offset+16);
const cipher=new aesjs.ModeOfOperation.cbc(key,ivKey);
const processed=encryptMode?cipher.encrypt(block):cipher.decrypt(block);
data.set(processed,offset);
}

function encrypt(data){
processBlock(data,0,true);
if(data.length>16){
const offset=data.length-16;
processBlock(data,offset,true);
}
return data;
}

function decrypt(data){
if(data.length>16){
const offset=data.length-16;
processBlock(data,offset,false);
}
processBlock(data,0,false);
return data;
}

return{

reset(key2,ivKey2,newSalt){
salt=newSalt;
this.setKey(key2,ivKey2);
},

setKey(key2,ivKey2){
rawKey=key2;
rawIvKey=ivKey2;
updateKey();
},

setSalt(newSalt){
salt=newSalt??null;
updateKey();
},

encrypt(rawBytes){
const result=encrypt(rawBytes);
rawBytes.set(result);
},

decrypt(cipherBytes){
if(cipherBytes==null)return;
const result=decrypt(cipherBytes);
cipherBytes.set(result);
}

};

}

function createEncryptedPacket(packet,crypter){
const padded=padTo20Bytes(packet);
const encrypted=new Uint8Array(padded);
crypter.encrypt(encrypted);
return encrypted;
}

const handlers={

161:(reader)=>({
opCode:reader.readSync(8),
name:reader.readStringSync(8),
hardwareVersion:`${reader.readSync(8)}.${reader.readSync(8)}`,
softwareVersion:`${reader.readSync(8)}.${reader.readSync(8)}`,
step:reader.readSync(8)
}),

163:(reader)=>({
opCode:reader.readSync(8),
state:Array.from({length:48},()=>reader.readSync(3)),
step:reader.readSync(8)
}),

164:(reader)=>({
opCode:reader.readSync(8),
batt:reader.readSync(8),
battStart:reader.readSync(8)
}),

165:(reader)=>({
opCode:reader.readSync(8),
step:reader.readSync(8)
})

};

function defaultHandler(reader){
return{
opCode:reader.readSync(8)
};
}

function normalizeMacCandidates(macSuffix){

if(macSuffix.length===17)return[macSuffix];
if(macSuffix.length!==5)return[];

const prefixes=[
"CF:30:16:01",
"CF:30:16:00",
"CF:30:17:01",
"CF:30:17:00",
"CF:30:18:01",
"CF:30:18:00",
"E8:89:2C:01",
"E8:89:2C:00",
"E8:89:5D:01",
"E8:89:5D:00"
];

return prefixes.map(p=>`${p}:${macSuffix}`);
}

export function createProtocol(mac){

const reader=new BitstreamReader();
const crypter=createCrypter();

if(mac.length===17){
crypter.reset(KEY,IV,mac.split(":").map(b=>parseInt(b,16)));
}

return{

checkMac(macSuffix,packet){

const candidates=normalizeMacCandidates(macSuffix);

for(const fullMac of candidates){

try{

crypter.reset(KEY,IV,fullMac.split(":").map(b=>parseInt(b,16)));

const decrypted=new Uint8Array(packet);
crypter.decrypt(decrypted);

if(decrypted[0]===161){
return fullMac;
}

}catch(e){}

}

return null;

},

handlePacket(packet){

const decrypted=new Uint8Array(packet);
crypter.decrypt(decrypted);

reader.reset();
reader.addBuffer(decrypted);

const opCode=decrypted[0];

const handler=handlers[opCode]??defaultHandler;

return handler(reader);

},

getCubeInfoPacketCheckMac(macSuffix){

const candidates=normalizeMacCandidates(macSuffix);

const packets=[];

for(const fullMac of candidates){

crypter.reset(KEY,IV,fullMac.split(":").map(b=>parseInt(b,16)));

const packet=new Uint8Array([161]);

packets.push({
mac:fullMac,
packet:createEncryptedPacket(packet,crypter)
});

}

return packets;

},

getCubeInfoPacket(){
return createEncryptedPacket(new Uint8Array([161]),crypter);
},

getCubeStatusPacket(){
return createEncryptedPacket(new Uint8Array([163]),crypter);
},

getCubePowerPacket(){
return createEncryptedPacket(new Uint8Array([164]),crypter);
}

};

}