var currentResult = null;

document.querySelectorAll('.ec-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.ec-btn').forEach(function(b){b.classList.remove('active');});
    btn.classList.add('active');
  });
});

var sizeSlider = document.getElementById('qr-size');
function updateSlider() {
  var v=+sizeSlider.value, min=+sizeSlider.min, max=+sizeSlider.max;
  sizeSlider.style.setProperty('--val', ((v-min)/(max-min)*100)+'%');
  document.getElementById('size-display').textContent = v+' × '+v;
}
sizeSlider.addEventListener('input', updateSlider);
updateSlider();

document.getElementById('fg-color').addEventListener('input', function(e){document.getElementById('fg-hex').textContent=e.target.value.toUpperCase();});
document.getElementById('bg-color').addEventListener('input', function(e){document.getElementById('bg-hex').textContent=e.target.value.toUpperCase();});

function getEC(){ return (document.querySelector('.ec-btn.active')||{dataset:{ec:'M'}}).dataset.ec; }

function buildSVG(matrix, fg, bg, margin, exportSize) {
  var n = matrix.length;
  var tot = n + margin * 2;
  var cell = 10;
  var vb = tot * cell;
  var sz = exportSize || vb;
  var rects = [];
  for (var r = 0; r < n; r++)
    for (var c = 0; c < n; c++)
      if (matrix[r][c])
        rects.push('<rect x="'+((c+margin)*cell)+'" y="'+((r+margin)*cell)+'" width="'+cell+'" height="'+cell+'"/>');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+vb+' '+vb+'" width="'+sz+'" height="'+sz+'" shape-rendering="crispEdges">'+
    '<rect width="'+vb+'" height="'+vb+'" fill="'+bg+'"/>'+
    '<g fill="'+fg+'">'+rects.join('')+'</g></svg>';
}

function generateQR() {
  var text = document.getElementById('qr-input').value.trim();
  if (!text) {
    var container=document.getElementById('qr-svg-container');
    var out=document.getElementById('output-card');
    container.innerHTML='<p class="error-msg">⚠ Please enter some content to encode.</p>';
    out.style.display='block';
    return;
  }
  var ec=getEC(), fg=document.getElementById('fg-color').value,
      bg=document.getElementById('bg-color').value,
      margin=parseInt(document.getElementById('qr-margin').value),
      size=parseInt(document.getElementById('qr-size').value);
  var container=document.getElementById('qr-svg-container'), out=document.getElementById('output-card');
  try {
    var r = QRCodeGen.encode(text, ec);
    currentResult = {matrix:r.matrix, version:r.version, fg:fg, bg:bg, margin:margin, size:size, ec:ec, text:text};
    container.innerHTML = buildSVG(r.matrix, fg, bg, margin, Math.min(size,480));
    document.getElementById('info-version').textContent = r.version;
    document.getElementById('info-modules').textContent = r.size+'×'+r.size;
    document.getElementById('info-ec').textContent = ec;
    document.getElementById('info-size').textContent = size+'×'+size+' px export';
    out.style.display='block';
    out.style.animation='none';
    out.offsetHeight;
    out.style.animation='fadeUp .35s ease forwards';
    out.scrollIntoView({behavior:'smooth',block:'nearest'});
  } catch(e) {
    container.innerHTML='<p class="error-msg">⚠ '+e.message+'</p>';
    out.style.display='block';
  }
}

function getFilename(ext){
  var s=document.getElementById('qr-input').value.trim().replace(/[^a-zA-Z0-9]/g,'_').substring(0,30);
  return 'qr_'+(s||'code')+'.'+ext;
}

function downloadSVG(){
  if(!currentResult)return;
  var svg=buildSVG(currentResult.matrix,currentResult.fg,currentResult.bg,currentResult.margin,currentResult.size);
  triggerDL(URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'})),getFilename('svg'));
}

function toCanvas(cb){
  if(!currentResult)return;
  var m=currentResult.matrix, n=m.length, margin=currentResult.margin;
  var tot=n+margin*2, size=currentResult.size;
  var cv=document.createElement('canvas'); cv.width=cv.height=size;
  var ctx=cv.getContext('2d');
  ctx.fillStyle=currentResult.bg; ctx.fillRect(0,0,size,size);
  var mod=size/tot;
  ctx.fillStyle=currentResult.fg;
  for(var r=0;r<n;r++){
    for(var c=0;c<n;c++){
      if(m[r][c]){
        var x=Math.round((c+margin)*mod);
        var y=Math.round((r+margin)*mod);
        var w=Math.round((c+margin+1)*mod)-x;
        var h=Math.round((r+margin+1)*mod)-y;
        ctx.fillRect(x,y,w,h);
      }
    }
  }
  cb(cv);
}

function downloadPNG(){toCanvas(function(cv){cv.toBlob(function(b){triggerDL(URL.createObjectURL(b),getFilename('png'));},'image/png');});}
function downloadJPG(){toCanvas(function(cv){cv.toBlob(function(b){triggerDL(URL.createObjectURL(b),getFilename('jpg'));},'image/jpeg',0.95);});}

function triggerDL(url,name){
  var a=document.createElement('a'); a.href=url; a.download=name; a.click();
  setTimeout(function(){URL.revokeObjectURL(url);},1000);
}

document.getElementById('qr-input').addEventListener('keydown',function(e){if(e.ctrlKey&&e.key==='Enter')generateQR();});
