import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readGraphData, sources } from './graph-data.mjs';
const files={'/':'graph.html','/graph-app.mjs':'graph-app.mjs','/graph.css':'graph.css'};
const types={'.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8'};
http.createServer(async(req,res)=>{try {
 const url=new URL(req.url,'http://127.0.0.1:4177'); res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/api/graph') {res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(await readGraphData()));return;}
 if(url.pathname==='/source' && sources.includes(url.searchParams.get('file'))) {res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(await readFile(new URL('../'+url.searchParams.get('file'),import.meta.url)));return;}
 const file=files[url.pathname]; if(!file){res.writeHead(404);res.end('Not found');return;}
 res.setHeader('Content-Type',types[file.slice(file.lastIndexOf('.'))]);res.end(await readFile(new URL(file,import.meta.url)));
 }catch(err){res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'});res.end('기록을 읽지 못했습니다: '+err.message);}
}).listen(4177,'127.0.0.1',()=>console.log('Agent Graph: http://127.0.0.1:4177'));
