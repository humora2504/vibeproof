/* Minimal privacy-respecting analytics beacon. No cookies, no PII, no IP storage.
   Events are posted to an unguessable ntfy.sh topic and aggregated locally. */
(function(){
  var T="https://ntfy.sh/vt-6uHQc5CrHhCs2o5LwyyB57";
  var q=new URLSearchParams(location.search);
  var src=q.get("utm_source")||q.get("src")||(document.referrer?new URL(document.referrer).hostname:"direct");
  var camp=q.get("utm_campaign")||q.get("c")||"";
  var seg=q.get("seg")||"";
  var variant=(window.VT_VARIANT||q.get("v")||"A");
  var vid=Math.random().toString(36).slice(2,10); // per-pageview id, not persisted
  var dev=/Mobi|Android/i.test(navigator.userAgent)?"mobile":"desktop";
  var lang=(navigator.language||"").slice(0,2);
  var t0=Date.now(), maxScroll=0, active=0, lastTick=Date.now(), sentDepth={};
  function send(ev,extra){
    var d={ev:ev,p:location.pathname,src:src,c:camp,seg:seg,v:variant,dev:dev,lang:lang,vid:vid,t:Math.round((Date.now()-t0)/1000)};
    if(extra)for(var k in extra)d[k]=extra[k];
    try{navigator.sendBeacon?navigator.sendBeacon(T,JSON.stringify(d)):fetch(T,{method:"POST",body:JSON.stringify(d),keepalive:true});}catch(e){}
  }
  window.vtTrack=send;
  send("view");
  document.addEventListener("scroll",function(){
    var h=document.documentElement; var pct=Math.round((h.scrollTop+innerHeight)/h.scrollHeight*100);
    if(pct>maxScroll){maxScroll=pct;[25,50,75,90].forEach(function(m){if(pct>=m&&!sentDepth[m]){sentDepth[m]=1;send("depth",{d:m});}});}
  },{passive:true});
  document.addEventListener("visibilitychange",function(){if(document.hidden){active+=Date.now()-lastTick;}else{lastTick=Date.now();}});
  addEventListener("pagehide",function(){active+=document.hidden?0:(Date.now()-lastTick);send("leave",{act:Math.round(active/1000),sc:maxScroll});});
  document.addEventListener("click",function(e){var a=e.target.closest("[data-track]");if(a){send("click",{id:a.getAttribute("data-track")});}});
})();
