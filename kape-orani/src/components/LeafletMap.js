// Leaflet + OpenStreetMap (walang Google Maps).
// Native (Expo Go): react-native-webview. Web (Snack): iframe srcDoc.
// Laging light mode ang OpenStreetMap tiles, kahit naka-dark mode ang buong app.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

let WebView = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch (_) {
    WebView = null;
  }
}

const HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css"/>
<style>
  html,body,#map{height:100%;margin:0;padding:0;background:#E8E8DF}
  .pin{width:34px;height:34px;border-radius:50%;background:#4A5D4E;border:3px solid #fff;
       box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:16px}
  .pin.sel{background:#D8A268;transform:scale(1.2)}
  #err{position:absolute;top:8px;left:8px;right:8px;z-index:9999;background:#FDECEA;color:#C0392B;
       padding:8px;border-radius:8px;font:12px sans-serif;display:none}
</style>
</head><body>
<div id="err"></div>
<div id="map"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>
<script>
function post(msg){
  try{
    if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
    else if(window.parent && window.parent!==window){ window.parent.postMessage({kapeorani:'event',data:msg},'*'); }
  }catch(e){}
}
function showErr(t){ var e=document.getElementById('err'); e.style.display='block'; e.textContent=t; post({type:'error',message:t}); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }

if(typeof L==='undefined'){
  showErr('Hindi na-load ang Leaflet. Check ang internet connection.');
} else {
  var map=L.map('map').setView([14.8005,120.5372],13);
  var lightTiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19, attribution:'&copy; OpenStreetMap contributors'
  });
  lightTiles.addTo(map);
  var cafeLayer=L.layerGroup().addTo(map);
  var routeLayer=L.layerGroup().addTo(map);
  var userMarker=null, lastViewKey=null;

  function cafeIcon(sel){
    return L.divIcon({className:'',html:'<div class="pin'+(sel?' sel':'')+'">&#9749;</div>',iconSize:[34,34],iconAnchor:[17,17]});
  }

  window.handleState=function(st){
    try{
      if(typeof st==='string') st=JSON.parse(st);
      cafeLayer.clearLayers(); routeLayer.clearLayers();
      var pts=[];
      (st.cafes||[]).forEach(function(c){
        var m=L.marker([c.lat,c.lng],{icon:cafeIcon(String(c.id)===String(st.selectedId))}).addTo(cafeLayer);
        m.bindTooltip(esc(c.name),{direction:'top',offset:[0,-16]});
        m.on('click',function(){ post({type:'select',id:c.id}); });
        pts.push([c.lat,c.lng]);
      });
      if(userMarker){ map.removeLayer(userMarker); userMarker=null; }
      if(st.user){
        userMarker=L.circleMarker([st.user.lat,st.user.lng],{radius:9,color:'#fff',weight:3,fillColor:'#1E6FFF',fillOpacity:1}).addTo(map);
        userMarker.bindTooltip(esc(st.user.label||'Ikaw'));
      }
      var routeBounds=null;
      if(st.route && st.route.length>1){
        var line=L.polyline(st.route,{color:'#1E6FFF',weight:6,opacity:0.9,dashArray:st.routeEstimated?'10 10':null}).addTo(routeLayer);
        routeBounds=line.getBounds();
      }
      var v=st.view||{};
      if(v.key!==lastViewKey){
        lastViewKey=v.key;
        if(v.mode==='route' && routeBounds){ map.fitBounds(routeBounds,{padding:[40,40]}); }
        else if(v.mode==='point' && v.lat!=null){ map.setView([v.lat,v.lng],16); }
        else if(pts.length>1){ map.fitBounds(pts,{padding:[40,40],maxZoom:16}); }
        else if(pts.length===1){ map.setView(pts[0],15); }
      }
    }catch(e){ showErr('Map error: '+e.message); }
  };

  map.on('click',function(){ post({type:'deselect'}); });
  function fix(){ map.invalidateSize(); }
  window.addEventListener('resize',fix);
  if(window.ResizeObserver){ new ResizeObserver(fix).observe(document.getElementById('map')); }
  window.addEventListener('message',function(e){
    if(e.data && e.data.kapeorani==='state'){ window.handleState(e.data.data); }
  });
  post({type:'ready'});
}
</script>
</body></html>`;

export default function LeafletMap({
  cafes = [],
  user = null,
  route = null,
  routeEstimated = false,
  selectedId = null,
  view = null,
  onSelect,
  onDeselect,
  onError,
  style,
}) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);

  const state = useMemo(
    () => ({ cafes, user, route, routeEstimated, selectedId, view }),
    [cafes, user, route, routeEstimated, selectedId, view]
  );

  const handleEvent = useCallback(
    (msg) => {
      if (!msg) return;
      if (msg.type === 'ready') setReady(true);
      else if (msg.type === 'select') onSelect && onSelect(msg.id);
      else if (msg.type === 'deselect') onDeselect && onDeselect();
      else if (msg.type === 'error') onError && onError(msg.message);
    },
    [onSelect, onDeselect, onError]
  );

  // Web: makinig sa iframe messages
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const listener = (e) => {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      if (e.data && e.data.kapeorani === 'event') handleEvent(e.data.data);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [handleEvent]);

  // Ipadala ang bagong state sa map
  useEffect(() => {
    if (!ready || !ref.current) return;
    if (Platform.OS === 'web') {
      if (ref.current.contentWindow) {
        ref.current.contentWindow.postMessage({ kapeorani: 'state', data: state }, '*');
      }
    } else if (ref.current.injectJavaScript) {
      const json = JSON.stringify(JSON.stringify(state));
      ref.current.injectJavaScript(`window.handleState(${json}); true;`);
    }
  }, [ready, state]);

  if (Platform.OS === 'web') {
    return (
      <View style={style}>
        {React.createElement('iframe', {
          ref,
          title: 'KapeOrani Leaflet Map',
          srcDoc: HTML,
          onLoad: () => setReady(true),
          style: { border: 0, position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
        })}
      </View>
    );
  }

  if (!WebView) {
    return null;
  }

  return (
    <View style={style}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html: HTML, baseUrl: 'https://kapeorani.app' }}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        onLoadEnd={() => setReady(true)}
        onMessage={(e) => {
          try {
            handleEvent(JSON.parse(e.nativeEvent.data));
          } catch (_) {}
        }}
        onError={(e) => onError && onError(e.nativeEvent.description || 'WebView error')}
        style={{ flex: 1, backgroundColor: 'transparent' }}
      />
    </View>
  );
}
