import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect,it } from 'vitest';
import type { DailyCheckIn } from '../../../packages/core/src/tree-growth';
import { MoodTree,treeArt } from './MoodTree';
const days=(count:number,mood:DailyCheckIn['mood']='bright'):DailyCheckIn[]=>Array.from({length:count},(_,i)=>({day:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),mood,timeZone:'America/Los_Angeles',createdAt:'2026-01-01T12:00:00.000Z',updatedAt:'2026-01-01T12:00:00.000Z'}));
it.each([1,13,14,29,30,64])('intentionally positions every daily leaf through %i days',count=>{
 const html=renderToStaticMarkup(createElement(MoodTree,{days:days(count)}));
 expect(html.match(/class="tree-leaf"/g)).toHaveLength(count);
 expect(html).toContain(`stage ${treeArt(count).stage}`);
 for(const [x,y] of treeArt(count).spots) {expect(x).toBeGreaterThan(0);expect(x).toBeLessThan(treeArt(count).width);expect(y).toBeGreaterThan(0);}
});
it('recolors the same count and preserves day labels',()=>{
 const before=renderToStaticMarkup(createElement(MoodTree,{days:days(14)}));
 const after=renderToStaticMarkup(createElement(MoodTree,{days:days(14,'low')}));
 expect(after.match(/class="tree-leaf"/g)).toHaveLength(14);expect(before).toContain('#f6b84b');expect(after).toContain('#ca6d82');expect(after).toContain('2026-01-01: Low');
 expect(after).not.toContain('tree-evolving');
});
it('groups older visual leaves while retaining the full daily count and stage',()=>{
 const html=renderToStaticMarkup(createElement(MoodTree,{days:days(100)}));
 expect(html.match(/class="tree-leaf"/g)).toHaveLength(64);expect(html).toContain('100 unique daily leaves');expect(html).toContain('36 earlier days');
});

it('grows taller and wider with more branching and a spreading canopy',()=>{
 const small=treeArt(13),middle=treeArt(29),large=treeArt(64);
 expect(middle.height).toBeGreaterThan(small.height);expect(large.height).toBeGreaterThan(middle.height);
 expect(middle.width).toBeGreaterThan(small.width);expect(large.width).toBeGreaterThan(middle.width);
 expect(middle.branches.length).toBeGreaterThan(small.branches.length);expect(large.branches.length).toBeGreaterThan(middle.branches.length);
 for(const art of [middle,large]) {
  expect(Math.min(...art.spots.map(p=>p[0]))).toBeLessThan(art.width*.15);
  expect(Math.max(...art.spots.map(p=>p[0]))).toBeGreaterThan(art.width*.85);
  expect(Math.min(...art.spots.map(p=>p[1]))).toBeLessThan(art.height*.15);
  for(const [x,y]of art.spots){expect(x).toBeGreaterThan(24);expect(x).toBeLessThan(art.width-24);expect(y).toBeGreaterThan(24);expect(y).toBeLessThan(art.ground);}
 }
});
