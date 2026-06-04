var QRCodeGen = (function() {
  "use strict";

  // GF(256) tables
  var GF_EXP = new Array(512), GF_LOG = new Array(256);
  (function(){
    var x = 1;
    for (var i = 0; i < 255; i++) {
      GF_EXP[i] = x; GF_LOG[x] = i;
      x = (x << 1) ^ (x & 128 ? 0x11D : 0);
    }
    for (var i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  })();

  function gfMul(a, b) {
    return (a && b) ? GF_EXP[GF_LOG[a] + GF_LOG[b]] : 0;
  }

  function rsGenerator(degree) {
    var g = new Array(degree).fill(0); g[degree-1] = 1;
    var root = 1;
    for (var i = 0; i < degree; i++) {
      for (var j = 0; j < degree; j++) {
        g[j] = gfMul(g[j], root);
        if (j+1 < degree) g[j] ^= g[j+1];
      }
      root = gfMul(root, 2);
    }
    return g;
  }

  function rsRemainder(data, gen) {
    var rem = new Array(gen.length).fill(0);
    for (var i = 0; i < data.length; i++) {
      var fac = data[i] ^ rem.shift(); rem.push(0);
      for (var j = 0; j < gen.length; j++) rem[j] ^= gfMul(gen[j], fac);
    }
    return rem;
  }

  // EC_BLOCKS[version-1][ecIdx]: [ecPerBlock, numBlocks]
  // ecIdx: L=0, M=1, Q=2, H=3
  var EC_BLOCKS = [
    [[7,1],[10,1],[13,1],[17,1]],
    [[10,1],[16,1],[22,1],[28,1]],
    [[15,1],[26,1],[18,2],[22,2]],
    [[20,1],[18,2],[26,2],[16,4]],
    [[26,1],[24,2],[18,4],[22,4]],
    [[18,2],[16,4],[24,4],[28,4]],
    [[20,2],[18,4],[18,6],[26,5]],
    [[24,2],[22,4],[22,6],[26,6]],
    [[30,2],[22,5],[20,8],[24,8]],
    [[18,4],[26,5],[24,8],[28,8]]
  ];

  // Total data codewords per version per EC level
  var DATA_CW = [
    [19,16,13,9],[34,28,22,16],[55,44,34,26],[80,64,48,36],
    [108,86,62,46],[136,108,76,60],[156,124,88,66],
    [194,154,110,86],[232,182,132,100],[274,216,154,122]
  ];

  var EC_IDX = {L:0, M:1, Q:2, H:3};

  // FORMAT_INFO[ec_bits_value][mask] — ec_bits: M=0,L=1,H=2,Q=3
  var FORMAT_INFO = [
    [0x5412,0x5125,0x5E7C,0x5B4B,0x45F9,0x40CE,0x4F97,0x4AA0], // M (00)
    [0x77C4,0x72F3,0x7DAA,0x789D,0x662F,0x6318,0x6C41,0x6976], // L (01)
    [0x1689,0x13BE,0x1CE7,0x19D0,0x0762,0x0255,0x0D0C,0x083B], // H (10)
    [0x355F,0x3068,0x3F31,0x3A06,0x24B4,0x2183,0x2EDA,0x2BED]  // Q (11)
  ];
  var EC_FMT_IDX = {L:1, M:0, Q:3, H:2};

  // Version info (v7-10)
  var VERSION_INFO = [null,null,null,null,null,null,null,0x07C94,0x085BC,0x09A99,0x0A4D3];

  // Alignment pattern centers (version 2-10)
  var ALIGN_POS = [[],[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];

  function toBytes(text) {
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var cp = text.charCodeAt(i);
      if (cp < 0x80) { out.push(cp); }
      else if (cp < 0x800) { out.push(0xC0|(cp>>6), 0x80|(cp&63)); }
      else { out.push(0xE0|(cp>>12), 0x80|((cp>>6)&63), 0x80|(cp&63)); }
    }
    return out;
  }

  function minVersion(byteLen, ecIdx) {
    for (var v = 1; v <= 10; v++) {
      if (byteLen <= DATA_CW[v-1][ecIdx] - 3) return v;
    }
    return -1;
  }

  function makeDataCW(bytes, version, ecIdx) {
    var total = DATA_CW[version-1][ecIdx];
    var bits = [], len = 0;

    function pushBits(val, n) {
      for (var i = n-1; i >= 0; i--) bits.push((val>>i)&1);
    }

    pushBits(4, 4);
    pushBits(bytes.length, 8);
    for (var i = 0; i < bytes.length; i++) pushBits(bytes[i], 8);

    var rem = total*8 - bits.length;
    for (var i = 0; i < Math.min(4, rem); i++) bits.push(0);
    while (bits.length % 8) bits.push(0);

    var cw = [], pad = [0xEC, 0x11], p = 0;
    for (var i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (var j = 0; j < 8; j++) b = (b<<1)|(bits[i+j]||0);
      cw.push(b);
    }
    while (cw.length < total) { cw.push(pad[p%2]); p++; }
    return cw;
  }

  function interleave(dataCW, version, ecIdx) {
    var ebSpec = EC_BLOCKS[version-1][ecIdx];
    var ecLen = ebSpec[0], numBlocks = ebSpec[1];
    var gen = rsGenerator(ecLen);
    var totalData = dataCW.length;
    var shortLen = Math.floor(totalData / numBlocks);
    var numLong = totalData % numBlocks;

    var dBlocks = [], eBlocks = [];
    var k = 0;
    for (var i = 0; i < numBlocks; i++) {
      var blen = shortLen + (i >= numBlocks - numLong ? 1 : 0);
      var b = dataCW.slice(k, k+blen); k += blen;
      dBlocks.push(b);
      eBlocks.push(rsRemainder(b, gen));
    }

    var out = [];
    var maxLen = shortLen + (numLong > 0 ? 1 : 0);
    for (var c = 0; c < maxLen; c++)
      for (var r = 0; r < numBlocks; r++)
        if (c < dBlocks[r].length) out.push(dBlocks[r][c]);
    for (var c = 0; c < ecLen; c++)
      for (var r = 0; r < numBlocks; r++)
        out.push(eBlocks[r][c]);
    return out;
  }

  function makeFuncMask(version, size) {
    var fm = [];
    for (var i = 0; i < size; i++) { fm.push([]); for (var j = 0; j < size; j++) fm[i].push(false); }

    function mark(r, c) { if (r>=0&&r<size&&c>=0&&c<size) fm[r][c]=true; }
    function markRect(r0,c0,h,w) { for(var i=r0;i<r0+h;i++) for(var j=c0;j<c0+w;j++) mark(i,j); }

    markRect(-1,-1,9,9); markRect(-1,size-8,9,9); markRect(size-8,-1,9,9);
    for (var i=0;i<size;i++) { fm[6][i]=true; fm[i][6]=true; }
    fm[size-8][8] = true;
    for (var i=0;i<=8;i++) { fm[8][i]=true; fm[i][8]=true; }
    for (var i=size-8;i<size;i++) { fm[8][i]=true; fm[i][8]=true; }
    var ap = ALIGN_POS[version]||[];
    for (var a=0;a<ap.length;a++) for (var b=0;b<ap.length;b++) {
      if (!fm[ap[a]][ap[b]]) markRect(ap[a]-2,ap[b]-2,5,5);
    }
    if (version>=7) { markRect(0,size-11,6,3); markRect(size-11,0,3,6); }
    return fm;
  }

  function placeFinder(mat, r0, c0, size) {
    for (var i=0;i<9;i++) for (var j=0;j<9;j++) {
      var r=r0+i-1, c=c0+j-1;
      if (r<0||r>=size||c<0||c>=size) continue;
      var inCore = i>=1&&i<=7&&j>=1&&j<=7;
      if (!inCore) { mat[r][c]=0; continue; }
      var ri=i-1,cj=j-1;
      if (ri===0||ri===6||cj===0||cj===6) mat[r][c]=1;
      else if (ri>=2&&ri<=4&&cj>=2&&cj<=4) mat[r][c]=1;
      else mat[r][c]=0;
    }
  }

  function placeAlignment(mat, r0, c0) {
    for (var i=-2;i<=2;i++) for (var j=-2;j<=2;j++) {
      var mx=Math.abs(i), my=Math.abs(j);
      mat[r0+i][c0+j] = (mx===2||my===2||(mx===0&&my===0)) ? 1 : 0;
    }
  }

  function placeTiming(mat, size) {
    for (var i=6;i<size-6;i++) {
      mat[6][i] = i%2===0?1:0;
      mat[i][6] = i%2===0?1:0;
    }
  }

  function placeFormat(mat, ecLevel, mask, size) {
    var fmtBits = FORMAT_INFO[EC_FMT_IDX[ecLevel]][mask];
    var pos1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    var pos2 = [[size-1,8],[size-2,8],[size-3,8],[size-4,8],[size-5,8],[size-6,8],[size-7,8],[8,size-8],[8,size-7],[8,size-6],[8,size-5],[8,size-4],[8,size-3],[8,size-2],[8,size-1]];
    for (var i=0;i<15;i++) {
      var bit = (fmtBits>>(14-i))&1;
      mat[pos1[i][0]][pos1[i][1]] = bit;
      mat[pos2[i][0]][pos2[i][1]] = bit;
    }
    mat[size-8][8] = 1;
  }

  function placeVersion(mat, version, size) {
    if (version < 7) return;
    var vi = VERSION_INFO[version];
    for (var i=0;i<18;i++) {
      var bit = (vi>>i)&1, r=Math.floor(i/3), c=i%3;
      mat[r][size-11+c] = bit;
      mat[size-11+c][r] = bit;
    }
  }

  function placeData(mat, cws, fm, size) {
    var bitIdx = 0;
    var totalBits = cws.length * 8;
    function nextBit() {
      if (bitIdx >= totalBits) return 0;
      var b = (cws[Math.floor(bitIdx/8)] >> (7 - bitIdx%8)) & 1;
      bitIdx++; return b;
    }
    var col = size-1, goUp = true;
    while (col >= 1) {
      if (col === 6) col--;
      for (var i=0;i<size;i++) {
        var row = goUp ? size-1-i : i;
        for (var dc=0;dc<2;dc++) {
          var c = col-dc;
          if (!fm[row][c] && mat[row][c] === null) mat[row][c] = nextBit();
        }
      }
      goUp = !goUp;
      col -= 2;
    }
  }

  var MASK_FN = [
    function(r,c){return (r+c)%2===0?1:0},
    function(r,c){return r%2===0?1:0},
    function(r,c){return c%3===0?1:0},
    function(r,c){return (r+c)%3===0?1:0},
    function(r,c){return (Math.floor(r/2)+Math.floor(c/3))%2===0?1:0},
    function(r,c){return (r*c)%2+(r*c)%3===0?1:0},
    function(r,c){return ((r*c)%2+(r*c)%3)%2===0?1:0},
    function(r,c){return ((r+c)%2+(r*c)%3)%2===0?1:0}
  ];

  function applyMask(mat, mask, fm, size) {
    var fn = MASK_FN[mask];
    for (var r=0;r<size;r++) for (var c=0;c<size;c++)
      if (!fm[r][c]) mat[r][c] ^= fn(r,c);
  }

  function penalty(mat, size) {
    var p = 0;
    for (var i=0;i<size;i++) {
      for (var isRow=0;isRow<2;isRow++) {
        var run=1, prev=isRow?mat[i][0]:mat[0][i];
        for (var j=1;j<size;j++) {
          var cur = isRow?mat[i][j]:mat[j][i];
          if (cur===prev) { run++; if(run===5)p+=3; else if(run>5)p++; }
          else { run=1; prev=cur; }
        }
      }
    }
    for (var r=0;r<size-1;r++) for (var c=0;c<size-1;c++)
      if (mat[r][c]===mat[r][c+1]&&mat[r][c]===mat[r+1][c]&&mat[r][c]===mat[r+1][c+1]) p+=3;
    var P1=[1,0,1,1,1,0,1,0,0,0,0], P2=[0,0,0,0,1,0,1,1,1,0,1];
    for (var r=0;r<size;r++) for (var c=0;c<=size-11;c++) {
      var m1r=true,m2r=true,m1c=true,m2c=true;
      for (var k=0;k<11;k++) {
        if(mat[r][c+k]!==P1[k])m1r=false; if(mat[r][c+k]!==P2[k])m2r=false;
        if(mat[c+k][r]!==P1[k])m1c=false; if(mat[c+k][r]!==P2[k])m2c=false;
      }
      if(m1r)p+=40; if(m2r)p+=40; if(m1c)p+=40; if(m2c)p+=40;
    }
    var dark=0; for(var r=0;r<size;r++) for(var c=0;c<size;c++) dark+=mat[r][c];
    var pct=dark*100/(size*size), lo=Math.floor(pct/5)*5;
    p += Math.min(Math.abs(lo-50),Math.abs(lo+5-50))*2;
    return p;
  }

  function encode(text, ecLevel) {
    ecLevel = ecLevel || 'M';
    var ecIdx = EC_IDX[ecLevel];
    var bytes = toBytes(text);
    var version = minVersion(bytes.length, ecIdx);
    if (version < 1) throw new Error("Input too long (max ~160 chars for EC-M)");

    var size = version*4+17;
    var fm = makeFuncMask(version, size);
    var dataCW = makeDataCW(bytes, version, ecIdx);
    var allCW = interleave(dataCW, version, ecIdx);

    var bestMat=null, bestPen=Infinity, bestMask=0;

    for (var mask=0; mask<8; mask++) {
      var mat = [];
      for (var i=0;i<size;i++) { mat.push([]); for(var j=0;j<size;j++) mat[i].push(null); }

      placeFinder(mat, 0, 0, size);
      placeFinder(mat, 0, size-7, size);
      placeFinder(mat, size-7, 0, size);
      placeTiming(mat, size);

      var ap = ALIGN_POS[version]||[];
      for (var a=0;a<ap.length;a++) for (var b=0;b<ap.length;b++)
        if (mat[ap[a]][ap[b]]===null) placeAlignment(mat, ap[a], ap[b]);

      mat[size-8][8] = 1;
      placeVersion(mat, version, size);
      placeData(mat, allCW, fm, size);
      applyMask(mat, mask, fm, size);
      placeFormat(mat, ecLevel, mask, size);

      var pen = penalty(mat, size);
      if (pen < bestPen) { bestPen=pen; bestMask=mask; bestMat=mat; }
    }

    return { matrix: bestMat, version: version, size: size, mask: bestMask };
  }

  return { encode: encode };
})();
