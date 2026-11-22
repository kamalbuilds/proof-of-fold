import{i as e,r as t}from"./hex-sWBIo_Q5.js";import{r as n,t as r}from"./utf8-BJ-5TjmJ.js";import{c as i,t as a}from"./push-BCP1nhp6.js";import{B as o,M as s,V as c,a as ee,f as l,m as u,s as d}from"./instruction-sets-utils-BddunQ4M.js";import{t as te}from"./bch-spec-opcodes-MYndsQLs.js";function f(e){return m(e?1n:0n)}function p(e){return o(e)}function m(e){return ee(e)}function ne(e,t){let n=m(e);if(n.length>t)throw Error(`value exceeds the requested byteLength`);return i(n,t)}function re(e,t=1e4){let n=c(e,{maximumVmNumberByteLength:t});if(s(n))throw Error(n);return n}function h(e,t=1e4){let n=c(e,{maximumVmNumberByteLength:t,requireMinimalEncoding:!1});if(s(n))throw Error(n);return n}function g(e){return n(e)}function _(e){return r(e)}var ie=`
# This file can be run with CashProof to prove that the optimisations preserve exact functionality
# This includes most of SolidCash's bytecode optimisations, although some are incompatible with CashProof

# Hardcoded arithmetic
# OP_NOT OP_IF                         <=> OP_NOTIF;
OP_1 OP_ADD                            <=> OP_1ADD;
OP_1 OP_SUB                            <=> OP_1SUB;
OP_1 OP_NEGATE                         <=> OP_1NEGATE;
OP_0 OP_NUMEQUAL OP_NOT                <=> OP_0NOTEQUAL;
OP_NUMEQUAL OP_NOT                     <=> OP_NUMNOTEQUAL;
OP_SHA256 OP_SHA256                    <=> OP_HASH256;
OP_SHA256 OP_RIPEMD160                 <=> OP_HASH160;

# Hardcoded stack ops
OP_2 OP_PICK OP_1 OP_PICK OP_3 OP_PICK <=> OP_3DUP OP_SWAP;
OP_2 OP_PICK OP_2 OP_PICK OP_2 OP_PICK <=> OP_3DUP;

OP_0 OP_PICK OP_2 OP_PICK              <=> OP_2DUP OP_SWAP;
OP_2 OP_PICK OP_4 OP_PICK              <=> OP_2OVER OP_SWAP;
OP_3 OP_PICK OP_3 OP_PICK              <=> OP_2OVER;

OP_2 OP_ROLL OP_3 OP_ROLL              <=> OP_2SWAP OP_SWAP;
OP_3 OP_ROLL OP_3 OP_ROLL              <=> OP_2SWAP;
OP_4 OP_ROLL OP_5 OP_ROLL              <=> OP_2ROT OP_SWAP;
OP_5 OP_ROLL OP_5 OP_ROLL              <=> OP_2ROT;

OP_0 OP_PICK                           <=> OP_DUP;
OP_1 OP_PICK                           <=> OP_OVER;
OP_0 OP_ROLL                           <=> ;
OP_1 OP_ROLL                           <=> OP_SWAP;
OP_2 OP_ROLL                           <=> OP_ROT;
OP_DROP OP_DROP                        <=> OP_2DROP;

# Secondary effects
OP_DUP OP_SWAP                         <=> OP_DUP;
OP_SWAP OP_SWAP                        <=> ;
OP_2SWAP OP_2SWAP                      <=> ;
OP_ROT OP_ROT OP_ROT                   <=> ;
OP_2ROT OP_2ROT OP_2ROT                <=> ;
OP_OVER OP_OVER                        <=> OP_2DUP;
OP_DUP OP_DROP                         <=> ;
OP_DUP OP_NIP                          <=> ;
OP_DUP OP_1ADD OP_NIP                   <=> OP_1ADD;
OP_DUP OP_1SUB OP_NIP                   <=> OP_1SUB;

# Enabling secondary effects
OP_DUP OP_OVER                         <=> OP_DUP OP_DUP;

# Merge OP_VERIFY
OP_EQUAL OP_VERIFY                     <=> OP_EQUALVERIFY;
OP_NUMEQUAL OP_VERIFY                  <=> OP_NUMEQUALVERIFY;
OP_CHECKSIG OP_VERIFY                  <=> OP_CHECKSIGVERIFY;
# OP_CHECKMULTISIG OP_VERIFY           <=> OP_CHECKMULTISIGVERIFY;
OP_CHECKDATASIG OP_VERIFY              <=> OP_CHECKDATASIGVERIFY;

# Remove/replace extraneous OP_SWAP
# OP_SWAP OP_AND                         <=> OP_AND;
# OP_SWAP OP_OR                          <=> OP_OR;
# OP_SWAP OP_XOR                         <=> OP_XOR;
OP_SWAP OP_ADD                         <=> OP_ADD;
# Explicit VERIFY variants must appear before their shorter counterparts
# to prevent partial matching when word boundary assertions are used.
OP_SWAP OP_EQUALVERIFY                 <=> OP_EQUALVERIFY;
OP_SWAP OP_EQUAL                       <=> OP_EQUAL;
OP_SWAP OP_NUMEQUALVERIFY              <=> OP_NUMEQUALVERIFY;
OP_SWAP OP_NUMEQUAL                    <=> OP_NUMEQUAL;
OP_SWAP OP_NUMNOTEQUAL                 <=> OP_NUMNOTEQUAL;
OP_SWAP OP_GREATERTHANOREQUAL          <=> OP_LESSTHANOREQUAL;
OP_SWAP OP_LESSTHANOREQUAL             <=> OP_GREATERTHANOREQUAL;
OP_SWAP OP_GREATERTHAN                 <=> OP_LESSTHAN;
OP_SWAP OP_LESSTHAN                    <=> OP_GREATERTHAN;
OP_SWAP OP_DROP                        <=> OP_NIP;
OP_SWAP OP_NIP                         <=> OP_DROP;

# Remove/replace extraneous OP_DUP
# OP_DUP OP_AND                         <=> ;
# OP_DUP OP_OR                          <=> ;
OP_DUP OP_DROP                        <=> ;
OP_DUP OP_NIP                         <=> ;

# Random optimisations (don't know what I'm targeting with this)
OP_2DUP OP_DROP                        <=> OP_OVER;
OP_2DUP OP_NIP                         <=> OP_DUP;
OP_CAT OP_DROP                         <=> OP_2DROP;
OP_NIP OP_DROP                         <=> OP_2DROP;

# Far-fetched stuff
OP_DUP OP_ROT OP_SWAP OP_DROP          <=> OP_SWAP;
OP_OVER OP_ROT OP_SWAP OP_DROP         <=> OP_SWAP;
OP_2 OP_PICK OP_ROT OP_SWAP OP_DROP    <=> OP_SWAP;
OP_3 OP_PICK OP_ROT OP_SWAP OP_DROP    <=> OP_SWAP;
OP_4 OP_PICK OP_ROT OP_SWAP OP_DROP    <=> OP_SWAP;
OP_5 OP_PICK OP_ROT OP_SWAP OP_DROP    <=> OP_SWAP;
OP_6 OP_PICK OP_ROT OP_SWAP OP_DROP    <=> OP_SWAP;
OP_7 OP_PICK OP_ROT OP_SWAP OP_DROP    <=> OP_SWAP;
OP_8 OP_PICK OP_ROT OP_SWAP OP_DROP    <=> OP_SWAP;
OP_9 OP_PICK OP_ROT OP_SWAP OP_DROP    <=> OP_SWAP;
OP_10 OP_PICK OP_ROT OP_SWAP OP_DROP   <=> OP_SWAP;
OP_11 OP_PICK OP_ROT OP_SWAP OP_DROP   <=> OP_SWAP;
OP_12 OP_PICK OP_ROT OP_SWAP OP_DROP   <=> OP_SWAP;
OP_13 OP_PICK OP_ROT OP_SWAP OP_DROP   <=> OP_SWAP;
OP_14 OP_PICK OP_ROT OP_SWAP OP_DROP   <=> OP_SWAP;
OP_15 OP_PICK OP_ROT OP_SWAP OP_DROP   <=> OP_SWAP;
OP_16 OP_PICK OP_ROT OP_SWAP OP_DROP   <=> OP_SWAP;

OP_DUP OP_ROT OP_DROP                  <=> OP_NIP OP_DUP;
OP_OVER OP_ROT OP_DROP                 <=> OP_SWAP;
OP_2 OP_PICK OP_ROT OP_DROP            <=> OP_NIP OP_OVER;

OP_0 OP_NIP                            <=> OP_DROP OP_0;
OP_1 OP_NIP                            <=> OP_DROP OP_1;
OP_2 OP_NIP                            <=> OP_DROP OP_2;
OP_3 OP_NIP                            <=> OP_DROP OP_3;
OP_4 OP_NIP                            <=> OP_DROP OP_4;
OP_5 OP_NIP                            <=> OP_DROP OP_5;
OP_6 OP_NIP                            <=> OP_DROP OP_6;
OP_7 OP_NIP                            <=> OP_DROP OP_7;
OP_8 OP_NIP                            <=> OP_DROP OP_8;
OP_9 OP_NIP                            <=> OP_DROP OP_9;
OP_10 OP_NIP                           <=> OP_DROP OP_10;
OP_11 OP_NIP                           <=> OP_DROP OP_11;
OP_12 OP_NIP                           <=> OP_DROP OP_12;
OP_13 OP_NIP                           <=> OP_DROP OP_13;
OP_14 OP_NIP                           <=> OP_DROP OP_14;
OP_15 OP_NIP                           <=> OP_DROP OP_15;
OP_16 OP_NIP                           <=> OP_DROP OP_16;

OP_2 OP_PICK OP_SWAP OP_2 OP_PICK OP_NIP <=> OP_DROP OP_2DUP;

# .slice(0, x) optimisation & .slice(x, y.length) optimisation
OP_0 OP_SPLIT OP_NIP                   <=> ;
OP_SIZE OP_SPLIT OP_DROP               <=> ;

# These are new optimisations that we cannot prove since CashProof doesn't work any more
# //////////////////////////////////////////////////////////////////////////////////////

OP_LESSTHAN OP_NOT                     <=> OP_GREATERTHANOREQUAL;
OP_GREATERTHAN OP_NOT                  <=> OP_LESSTHANOREQUAL;
OP_LESSTHANOREQUAL OP_NOT              <=> OP_GREATERTHAN;
OP_GREATERTHANOREQUAL OP_NOT           <=> OP_LESSTHAN;
`,ae=[[`OP_1 OP_ADD`,`OP_1ADD`],[`OP_1 OP_SUB`,`OP_1SUB`],[`OP_1 OP_NEGATE`,`OP_1NEGATE`],[`OP_0 OP_NUMEQUAL OP_NOT`,`OP_0NOTEQUAL`],[`OP_NUMEQUAL OP_NOT`,`OP_NUMNOTEQUAL`],[`OP_SHA256 OP_SHA256`,`OP_HASH256`],[`OP_SHA256 OP_RIPEMD160`,`OP_HASH160`],[`OP_2 OP_PICK OP_1 OP_PICK OP_3 OP_PICK`,`OP_3DUP OP_SWAP`],[`OP_2 OP_PICK OP_2 OP_PICK OP_2 OP_PICK`,`OP_3DUP`],[`OP_0 OP_PICK OP_2 OP_PICK`,`OP_2DUP OP_SWAP`],[`OP_2 OP_PICK OP_4 OP_PICK`,`OP_2OVER OP_SWAP`],[`OP_3 OP_PICK OP_3 OP_PICK`,`OP_2OVER`],[`OP_2 OP_ROLL OP_3 OP_ROLL`,`OP_2SWAP OP_SWAP`],[`OP_3 OP_ROLL OP_3 OP_ROLL`,`OP_2SWAP`],[`OP_4 OP_ROLL OP_5 OP_ROLL`,`OP_2ROT OP_SWAP`],[`OP_5 OP_ROLL OP_5 OP_ROLL`,`OP_2ROT`],[`OP_0 OP_PICK`,`OP_DUP`],[`OP_1 OP_PICK`,`OP_OVER`],[`OP_0 OP_ROLL`,``],[`OP_1 OP_ROLL`,`OP_SWAP`],[`OP_2 OP_ROLL`,`OP_ROT`],[`OP_DROP OP_DROP`,`OP_2DROP`],[`OP_DUP OP_SWAP`,`OP_DUP`],[`OP_SWAP OP_SWAP`,``],[`OP_2SWAP OP_2SWAP`,``],[`OP_ROT OP_ROT OP_ROT`,``],[`OP_2ROT OP_2ROT OP_2ROT`,``],[`OP_OVER OP_OVER`,`OP_2DUP`],[`OP_DUP OP_DROP`,``],[`OP_DUP OP_NIP`,``],[`OP_DUP OP_1ADD OP_NIP`,`OP_1ADD`],[`OP_DUP OP_1SUB OP_NIP`,`OP_1SUB`],[`OP_DUP OP_OVER`,`OP_DUP OP_DUP`],[`OP_EQUAL OP_VERIFY`,`OP_EQUALVERIFY`],[`OP_NUMEQUAL OP_VERIFY`,`OP_NUMEQUALVERIFY`],[`OP_CHECKSIG OP_VERIFY`,`OP_CHECKSIGVERIFY`],[`OP_CHECKDATASIG OP_VERIFY`,`OP_CHECKDATASIGVERIFY`],[`OP_SWAP OP_ADD`,`OP_ADD`],[`OP_SWAP OP_EQUALVERIFY`,`OP_EQUALVERIFY`],[`OP_SWAP OP_EQUAL`,`OP_EQUAL`],[`OP_SWAP OP_NUMEQUALVERIFY`,`OP_NUMEQUALVERIFY`],[`OP_SWAP OP_NUMEQUAL`,`OP_NUMEQUAL`],[`OP_SWAP OP_NUMNOTEQUAL`,`OP_NUMNOTEQUAL`],[`OP_SWAP OP_GREATERTHANOREQUAL`,`OP_LESSTHANOREQUAL`],[`OP_SWAP OP_LESSTHANOREQUAL`,`OP_GREATERTHANOREQUAL`],[`OP_SWAP OP_GREATERTHAN`,`OP_LESSTHAN`],[`OP_SWAP OP_LESSTHAN`,`OP_GREATERTHAN`],[`OP_SWAP OP_DROP`,`OP_NIP`],[`OP_SWAP OP_NIP`,`OP_DROP`],[`OP_DUP OP_DROP`,``],[`OP_DUP OP_NIP`,``],[`OP_2DUP OP_DROP`,`OP_OVER`],[`OP_2DUP OP_NIP`,`OP_DUP`],[`OP_CAT OP_DROP`,`OP_2DROP`],[`OP_NIP OP_DROP`,`OP_2DROP`],[`OP_DUP OP_ROT OP_SWAP OP_DROP`,`OP_SWAP`],[`OP_OVER OP_ROT OP_SWAP OP_DROP`,`OP_SWAP`],[`OP_2 OP_PICK OP_ROT OP_SWAP OP_DROP`,`OP_SWAP`],[`OP_3 OP_PICK OP_ROT OP_SWAP OP_DROP`,`OP_SWAP`],[`OP_4 OP_PICK OP_ROT OP_SWAP OP_DROP`,`OP_SWAP`],[`OP_5 OP_PICK OP_ROT OP_SWAP OP_DROP`,`OP_SWAP`],[`OP_6 OP_PICK OP_ROT OP_SWAP OP_DROP`,`OP_SWAP`],[`OP_7 OP_PICK OP_ROT OP_SWAP OP_DROP`,`OP_SWAP`],[`OP_8 OP_PICK OP_ROT OP_SWAP OP_DROP`,`OP_SWAP`],[`OP_9 OP_PICK OP_ROT OP_SWAP OP_DROP`,`OP_SWAP`],[`OP_10 OP_PICK OP_ROT OP_SWAP OP_DROP`,`OP_SWAP`],[`OP_11 OP_PICK OP_ROT OP_SWAP OP_DROP`,`OP_SWAP`],[`OP_12 OP_PICK OP_ROT OP_SWAP OP_DROP`,`OP_SWAP`],[`OP_13 OP_PICK OP_ROT OP_SWAP OP_DROP`,`OP_SWAP`],[`OP_14 OP_PICK OP_ROT OP_SWAP OP_DROP`,`OP_SWAP`],[`OP_15 OP_PICK OP_ROT OP_SWAP OP_DROP`,`OP_SWAP`],[`OP_16 OP_PICK OP_ROT OP_SWAP OP_DROP`,`OP_SWAP`],[`OP_DUP OP_ROT OP_DROP`,`OP_NIP OP_DUP`],[`OP_OVER OP_ROT OP_DROP`,`OP_SWAP`],[`OP_2 OP_PICK OP_ROT OP_DROP`,`OP_NIP OP_OVER`],[`OP_0 OP_NIP`,`OP_DROP OP_0`],[`OP_1 OP_NIP`,`OP_DROP OP_1`],[`OP_2 OP_NIP`,`OP_DROP OP_2`],[`OP_3 OP_NIP`,`OP_DROP OP_3`],[`OP_4 OP_NIP`,`OP_DROP OP_4`],[`OP_5 OP_NIP`,`OP_DROP OP_5`],[`OP_6 OP_NIP`,`OP_DROP OP_6`],[`OP_7 OP_NIP`,`OP_DROP OP_7`],[`OP_8 OP_NIP`,`OP_DROP OP_8`],[`OP_9 OP_NIP`,`OP_DROP OP_9`],[`OP_10 OP_NIP`,`OP_DROP OP_10`],[`OP_11 OP_NIP`,`OP_DROP OP_11`],[`OP_12 OP_NIP`,`OP_DROP OP_12`],[`OP_13 OP_NIP`,`OP_DROP OP_13`],[`OP_14 OP_NIP`,`OP_DROP OP_14`],[`OP_15 OP_NIP`,`OP_DROP OP_15`],[`OP_16 OP_NIP`,`OP_DROP OP_16`],[`OP_2 OP_PICK OP_SWAP OP_2 OP_PICK OP_NIP`,`OP_DROP OP_2DUP`],[`OP_0 OP_SPLIT OP_NIP`,``],[`OP_SIZE OP_SPLIT OP_DROP`,``]],oe=[[`OP_LESSTHAN OP_NOT`,`OP_GREATERTHANOREQUAL`],[`OP_GREATERTHAN OP_NOT`,`OP_LESSTHANOREQUAL`],[`OP_LESSTHANOREQUAL OP_NOT`,`OP_GREATERTHAN`],[`OP_GREATERTHANOREQUAL OP_NOT`,`OP_LESSTHAN`],[`OP_NOT OP_IF`,`OP_NOTIF`],[`OP_CHECKMULTISIG OP_VERIFY`,`OP_CHECKMULTISIGVERIFY`],[`OP_SWAP OP_AND`,`OP_AND`],[`OP_SWAP OP_OR`,`OP_OR`],[`OP_SWAP OP_XOR`,`OP_XOR`],[`OP_DUP OP_AND`,``],[`OP_DUP OP_OR`,``]],v=[...ae,...oe],y=class{constructor(e=!1,t){this.payable=e,this.interfaceName=t}toString(){return this.payable?`address payable`:`address`}},b=class{constructor(e,t){this.elementType=e,this.bound=t}toString(){return`${this.elementType}[${this.bound??``}]`}},x=class e{constructor(e){this.bound=e}static fromString(t){if(t===`byte`)return new e(1);if(t===`bytes`)return new e;let n=t.substring(5),r=Number.parseInt(n,10);if(Number.isNaN(r)||r.toString()!==n)throw Error(`Invalid bytes type bound: "${t}"`);return new e(r)}toString(){return`bytes${this.bound??``}`}},S=class{constructor(e,t){this.signed=e,this.bits=t}get minValue(){return this.signed?-(1n<<BigInt(this.bits-1)):0n}get maxValue(){return this.signed?(1n<<BigInt(this.bits-1))-1n:(1n<<BigInt(this.bits))-1n}get byteWidth(){return Math.ceil((this.bits+1)/8)}toString(){return`${this.signed?`int`:`uint`}${this.bits}`}static isValidBitWidth(e){return e>=8&&e<=256&&e%8==0}},C=class{constructor(e,t,n){this.signed=e,this.bits=t,this.decimals=n,this.scaleFactor=10n**BigInt(n)}get minValue(){return this.signed?-(1n<<BigInt(this.bits-1)):0n}get maxValue(){return this.signed?(1n<<BigInt(this.bits-1))-1n:(1n<<BigInt(this.bits))-1n}get byteWidth(){return Math.ceil((this.bits+1)/8)}toString(){return`${this.signed?`fixed`:`ufixed`}${this.bits}x${this.decimals}`}static isValidBitWidth(e){return e>=8&&e<=256&&e%8==0}static isValidDecimals(e){return e>=0&&e<=80&&Number.isInteger(e)}},w=class e{constructor(e,t,n,r){this.keyType=e,this.valueType=t,this.keyName=n,this.valueName=r}toString(){return`mapping(${this.keyType} => ${this.valueType})`}toSourceString(){return`mapping(${this.keyName?`${this.keyType} ${this.keyName}`:`${this.keyType}`} => ${this.valueType instanceof e?this.valueType.toSourceString():this.valueName?`${this.valueType} ${this.valueName}`:`${this.valueType}`})`}},T=class{constructor(e,t){this.name=e,this.fields=t}toString(){return this.name}},E=class{constructor(e,t){this.name=e,this.underlyingType=t}toString(){return this.name}};function D(e){return e?e instanceof E?e.underlyingType.toString():e.toString().replace(/address payable/g,`address`):`address`}var O=class{constructor(e,t,n=!1,r=`nonpayable`){this.parameterTypes=e,this.returnTypes=t,this.isExternal=n,this.stateMutability=r}toString(){let e=`function(${this.parameterTypes.map(e=>e.toString()).join(`,`)})${this.isExternal?`external`:``}`;return this.returnTypes.length===0?e:`${e}returns(${this.returnTypes.map(e=>e.toString()).join(`,`)})`}},se=2147483647n,k;(function(e){e.INT=`int`,e.BIGINT=`bigint`,e.BOOL=`bool`,e.STRING=`string`,e.PUBKEY=`pubkey`,e.SIG=`sig`,e.DATASIG=`datasig`,e.ANY=`any`,e.VOID=`void`})(k||={}),k.INT,k.INT,k.BIGINT,k.BOOL,k.BIGINT,k.BIGINT,k.INT,k.BOOL,k.BOOL,k.BOOL,k.BIGINT,k.STRING,k.STRING,k.PUBKEY,k.PUBKEY,k.SIG,k.SIG,k.DATASIG,k.DATASIG,k.ANY,k.VOID;function A(e){if(e===`address payable`||e===`addresspayable`)return new y(!0);if(e===`address`)return new y;if(e===`bigint`)return k.BIGINT;if(e===`int`)return new S(!0,256);if(e===`uint`)return new S(!1,256);if(e.endsWith(`]`)&&e.includes(`[`)){let t=e.lastIndexOf(`[`),n=e.substring(0,t),r=e.substring(t+1,e.length-1);return new b(A(n),r?parseInt(r,10):void 0)}if(e.startsWith(`byte`))return x.fromString(e);if(e.startsWith(`function(`))return F(e);if(e.startsWith(`mapping(`)&&e.endsWith(`)`)){let t=e.slice(8,-1),n=H(t);if(n>=0){let e=t.slice(0,n).trim(),r=t.slice(n+2).trim(),i=R(e),a=R(r),o=new w(i.type,a.type,i.name,a.name);return z(o),o}}let t=e.match(/^(u?int)(\d+)$/);if(t){let e=t[1]===`int`,n=parseInt(t[2],10);if(S.isValidBitWidth(n))return new S(e,n)}if(e===`fixed`)return new C(!0,128,18);if(e===`ufixed`)return new C(!1,128,18);let n=e.match(/^(u?fixed)(\d+)x(\d+)$/);if(n){let e=n[1]===`fixed`,t=parseInt(n[2],10),r=parseInt(n[3],10);if(C.isValidBitWidth(t)&&C.isValidDecimals(r))return new C(e,t,r)}return k[e.toUpperCase()]}function j(e){let t=A(e);if(t===void 0)throw Error(`Unrecognized type string "${e}"`);return t}function M(e){let t=typeof e==`string`?A(e):e;return t===void 0?!1:t===k.BOOL||t===k.PUBKEY?!0:t instanceof x?t.bound!==void 0:t instanceof S||t instanceof C?!0:t instanceof E?M(t.underlyingType):t instanceof T?t.fields.every(e=>M(e.type)):t instanceof b&&t.bound!==void 0&&M(t.elementType)}function N(e){let t=typeof e==`string`?j(e):e;if(t===k.BOOL)return 1;if(t===k.PUBKEY)return 33;if(t instanceof x&&t.bound!==void 0)return t.bound;if(t instanceof S||t instanceof C)return t.byteWidth;if(t instanceof E)return N(t.underlyingType);if(t instanceof T)return t.fields.reduce((e,t)=>e+N(t.type),0);if(t instanceof b&&t.bound!==void 0)return t.bound*N(t.elementType);throw Error(`Type is not fixed-width: ${t}`)}var P=[`pure`,`view`,`internal`,`external`,`payable`,`public`,`private`];function F(e){let[t,n]=B(e.slice(8)),r=n,i=!1,a=`nonpayable`;for(let e=!0;e;){e=!1;for(let t of P)r.startsWith(t)&&(t===`external`&&(i=!0),(t===`pure`||t===`view`||t===`payable`)&&(a=t),r=r.slice(t.length),e=!0)}let o=[];if(r.startsWith(`returns(`)){let[e]=B(r.slice(7));o=V(e).map(I)}return new O(V(t).map(I),o,i,a)}function I(e){return L(e.replace(/(memory|calldata|storage)$/,``))??new y(!1)}function L(e){return R(e).type}function R(e){let t=A(e);if(t)return{type:t};for(let t=e.length-1;t>0;t--){let n=e.slice(0,t),r=e.slice(t);if(!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(r))continue;let i=A(n.replace(/(memory|calldata|storage)$/,``));if(i)return{type:i,name:r}}return{type:new y(!1)}}function z(e){let t=new Set,n=e=>{for(let n of[e.keyName,e.valueName])if(n){if(t.has(n))throw Error(`Conflicting parameter name '${n}' in mapping`);t.add(n)}e.valueType instanceof w&&n(e.valueType)};n(e)}function B(e){let t=0;for(let n=0;n<e.length;n++)if(e[n]===`(`)t++;else if(e[n]===`)`&&(t--,t===0))return[e.slice(1,n),e.slice(n+1)];return[e.slice(1),``]}function V(e){if(e===``)return[];let t=[],n=0,r=0;for(let i=0;i<e.length;i++){let a=e[i];a===`(`||a===`[`?n++:a===`)`||a===`]`?n--:a===`,`&&n===0&&(t.push(e.slice(r,i)),r=i+1)}return t.push(e.slice(r)),t}function H(e){let t=0;for(let n=0;n<e.length-1;n++)if(e[n]===`(`)t++;else if(e[n]===`)`)t--;else if(t===0&&e[n]===`=`&&e[n+1]===`>`)return n;return-1}var U;(function(e){e[e.START=0]=`START`,e[e.END=1]=`END`})(U||={}),v.map(([e,t])=>({pattern:e,replacement:t,regex:RegExp(`${e}(\\s|$)`,`g`)}));var W=te;function G(e){return Q(Y(e))}function ce(e){return $(Y(e))}function le(e){return X(Z(e))}var ue=80,K=129,q=e=>e.length===1&&(e[0]!==0&&e[0]<=16||e[0]===K);function J(e){if(typeof e==`number`)return 1;let{length:t}=e;return t===0||q(e)?1:t<=75?t+1:t<=255?t+2:t<=65535?t+3:t+5}function Y(e){let t=0;for(let n of e)t+=J(n);let n=new Uint8Array(t),r=0;for(let t of e){if(typeof t==`number`){n[r]=t,r+=1;continue}let{length:e}=t;e===1&&q(t)?(n[r]=t[0]===K?W.OP_1NEGATE:t[0]+ue,r+=1):(e<=75?(n[r]=e,r+=1):e<=255?(n[r]=W.OP_PUSHDATA_1,n[r+1]=e,r+=2):e<=65535?(n[r]=W.OP_PUSHDATA_2,n[r+1]=e&255,n[r+2]=e>>>8&255,r+=3):(n[r]=W.OP_PUSHDATA_4,n[r+1]=e&255,n[r+2]=e>>>8&255,n[r+3]=e>>>16&255,n[r+4]=e>>>24&255,r+=5),n.set(t,r),r+=e)}return n}function X(e){return d(e).map(e=>`data`in e?e.data:e.opcode)}function Z(t){if(t=t.replace(/\s+/g,` `).trim(),t===``)return new Uint8Array;let n=t.split(` `).map(t=>{if(t.startsWith(`OP_`)){let e=W[t];if(e===void 0)throw Error(`asmToBytecode: unknown opcode "${t}"`);return{opcode:e}}let n=t.replace(/<|>/g,``).replace(/^0x/,``);return d(a(e(n)))[0]});return u(n)}function Q(e){let t=l(e);return t=t.replace(/OP_PUSHBYTES_[^\s]+/g,``),t=t.replace(/OP_PUSHDATA[^\s]+ [^\s]+/g,``),t=t.replace(/(^|\s)0x/g,` `),t=t.replace(/\s+/g,` `).trim(),t}function $(e){let t=l(e);return t=t.replace(/OP_PUSHBYTES_[^\s]+/g,``),t=t.replace(/OP_PUSHDATA[^\s]+ [^\s]+/g,``),t=t.replace(/(^|\s)(0x\w*)/g,` <$2>`),t=t.replace(/\s+/g,` `).trim(),t}function de(e){return e.filter(e=>typeof e==`number`).filter(e=>e>W.OP_16).length}function fe(e){return t(e.map(e=>typeof e==`number`?new Uint8Array([e]):a(e)))}function pe(e,t){return[...t.slice().reverse(),...e]}ie.split(`
`).map(e=>e.trim()).filter(e=>!e.startsWith(`#`)).join(``).split(`;`).map(e=>e.trim()).map(e=>e.split(`<=>`).map(e=>e.trim())).filter(e=>e.length===2).map(([e,t])=>({regex:new RegExp(e.replace(/(OP_\w+)/g,`$1(?=\\s|$)`),`g`),replacement:t}));export{p as A,T as C,M as D,N as E,m as F,ne as I,g as L,h as M,_ as N,A as O,f as P,k as S,D as T,O as _,$ as a,w as b,fe as c,ce as d,Y as f,C as g,x as h,Q as i,re as j,j as k,pe as l,b as m,Z as n,X as o,y as p,le as r,de as s,W as t,G as u,se as v,E as w,U as x,S as y};