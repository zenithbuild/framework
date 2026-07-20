import{p as at}from"./chunk-JWPE2WC7-27ba1785.js";import{z as rt,n as it,o as nt,s as st,g as ot,c as lt,b as ct,_ as l,l as E,p as dt,d as gt,A as ht,E as pt,F as ft,G as U,H as ut,k as mt,I as vt}from"./index-b80af343.js";import{v as St}from"./mermaid-parser.core-671e88a5.js";var V=rt.pie,R={sections:new Map,showData:!1,config:V},T=R.sections,F=R.showData,xt=structuredClone(V),wt=l(()=>structuredClone(xt),"getConfig"),Ct=l(()=>{T=new Map,F=R.showData,dt()},"clear"),$t=l(({label:t,value:a})=>{if(a<0)throw new Error(`"${t}" has invalid value: ${a}. Negative values are not allowed in pie charts. All slice values must be >= 0.`);T.has(t)||(T.set(t,a),E.debug(`added new section: ${t}, with value: ${a}`))},"addSection"),Dt=l(()=>T,"getSections"),yt=l(t=>{F=t},"setShowData"),Tt=l(()=>F,"getShowData"),X={getConfig:wt,clear:Ct,setDiagramTitle:it,getDiagramTitle:nt,setAccTitle:st,getAccTitle:ot,setAccDescription:lt,getAccDescription:ct,addSection:$t,getSections:Dt,setShowData:yt,getShowData:Tt},bt=l((t,a)=>{at(t,a),a.setShowData(t.showData),t.sections.map(a.addSection)},"populateDb"),At={parse:l(async t=>{const a=await St("pie",t);E.debug(a),bt(a,X)},"parse")},kt=l(t=>`
  .pieCircle{
    stroke: ${t.pieStrokeColor};
    stroke-width : ${t.pieStrokeWidth};
    opacity : ${t.pieOpacity};
  }
  .pieCircle.highlighted{
    scale: 1.05;
    opacity: 1;
  }
  .pieCircle.highlightedOnHover:hover{
    transition-duration: 250ms;
    scale: 1.05;
    opacity: 1;
  }
  .pieOuterCircle{
    stroke: ${t.pieOuterStrokeColor};
    stroke-width: ${t.pieOuterStrokeWidth};
    fill: none;
  }
  .pieTitleText {
    text-anchor: middle;
    font-size: ${t.pieTitleTextSize};
    fill: ${t.pieTitleTextColor};
    font-family: ${t.fontFamily};
  }
  .slice {
    font-family: ${t.fontFamily};
    fill: ${t.pieSectionTextColor};
    font-size:${t.pieSectionTextSize};
    // fill: white;
  }
  .legend text {
    fill: ${t.pieLegendTextColor};
    font-family: ${t.fontFamily};
    font-size: ${t.pieLegendTextSize};
  }
`,"getStyles"),_t=kt,zt=l(t=>{const a=[...t.values()].reduce((s,m)=>s+m,0),H=[...t.entries()].map(([s,m])=>({label:s,value:m})).filter(s=>s.value/a*100>=1);return vt().value(s=>s.value).sort(null)(H)},"createPieArcs"),Et=l((t,a,H,L)=>{var N;E.debug(`rendering pie chart
`+t);const s=L.db,m=gt(),p=ht(s.getConfig(),m.pie),W=40,i=18,c=4,S=450,x=S,b=pt(a),$=b.append("g");$.attr("transform","translate("+x/2+","+S/2+")");const{themeVariables:n}=m;let[G]=ft(n.pieOuterStrokeWidth);G??(G=2);const Z=p.legendPosition,M=p.textPosition,j=p.donutHole>0&&p.donutHole<=.9?p.donutHole:0,f=Math.min(x,S)/2-W,q=U().innerRadius(j*f).outerRadius(f),J=U().innerRadius(f*M).outerRadius(f*M),w=$.append("g");w.append("circle").attr("cx",0).attr("cy",0).attr("r",f+G/2).attr("class","pieOuterCircle");const D=s.getSections(),K=zt(D),Q=[n.pie1,n.pie2,n.pie3,n.pie4,n.pie5,n.pie6,n.pie7,n.pie8,n.pie9,n.pie10,n.pie11,n.pie12];let A=0;D.forEach(e=>{A+=e});const O=K.filter(e=>(e.data.value/A*100).toFixed(0)!=="0"),k=ut(Q).domain([...D.keys()]);w.selectAll("mySlices").data(O).enter().append("path").attr("d",q).attr("fill",e=>k(e.data.label)).attr("class",e=>{let r="pieCircle";return p.highlightSlice==="hover"?r+=" highlightedOnHover":p.highlightSlice===e.data.label&&(r+=" highlighted"),r}),w.selectAll("mySlices").data(O).enter().append("text").text(e=>(e.data.value/A*100).toFixed(0)+"%").attr("transform",e=>"translate("+J.centroid(e)+")").style("text-anchor","middle").attr("class","slice");const Y=$.append("text").text(s.getDiagramTitle()).attr("x",0).attr("y",-(S-50)/2).attr("class","pieTitleText"),C=[...D.entries()].map(([e,r])=>({label:e,value:r})),u=$.selectAll(".legend").data(C).enter().append("g").attr("class","legend");u.append("rect").attr("width",i).attr("height",i).style("fill",e=>k(e.label)).style("stroke",e=>k(e.label)),u.append("text").attr("x",i+c).attr("y",i-c).text(e=>s.getShowData()?`${e.label} [${e.value}]`:e.label);const v=Math.max(...u.selectAll("text").nodes().map(e=>(e==null?void 0:e.getBoundingClientRect().width)??0));let y=S,_=x+W;const o=i+c,z=C.length*o;switch(Z){case"center":u.attr("transform",(e,r)=>{const d=o*C.length/2,g=-v/2-(i+c),h=r*o-d;return"translate("+g+","+h+")"});break;case"top":y+=z,u.attr("transform",(e,r)=>{const d=f,g=-v/2-(i+c),h=r*o-d;return`translate(${g}, ${h})`}),w.attr("transform",()=>`translate(0, ${z+o})`);break;case"bottom":y+=z,u.attr("transform",(e,r)=>{const d=-f-o,g=-v/2-(i+c),h=r*o-d;return"translate("+g+","+h+")"});break;case"left":_+=i+c+v,u.attr("transform",(e,r)=>{const d=o*C.length/2,g=-f-(i+c),h=r*o-d;return"translate("+g+","+h+")"}),w.attr("transform",()=>`translate(${v+i+c}, 0)`);break;case"right":default:_+=i+c+v,u.attr("transform",(e,r)=>{const d=o*C.length/2,g=12*i,h=r*o-d;return"translate("+g+","+h+")"});break}const P=((N=Y.node())==null?void 0:N.getBoundingClientRect().width)??0,tt=x/2-P/2,et=x/2+P/2,B=Math.min(0,tt),I=Math.max(_,et)-B;b.attr("viewBox",`${B} 0 ${I} ${y}`),mt(b,y,I,p.useMaxWidth)},"draw"),Rt={draw:Et},Gt={parser:At,db:X,renderer:Rt,styles:_t};export{Gt as diagram};
