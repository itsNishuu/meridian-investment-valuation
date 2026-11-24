import test from 'node:test';
import assert from 'node:assert/strict';
import {statementModel} from '../advanced.js';
const x={revenue:1250,growth:.08,margin:.17,daPct:.038,capexPct:.057,nwcPct:.11,tax:.25,interestRate:.09,debt:260,repayment:30,cash:95,ppe:450,nwc:137.5,equity:422.5};test('five statements balance and cash reconciles',()=>{let cash=x.cash;for(const y of statementModel(x)){assert.ok(Math.abs(y.balanceCheck)<1e-8);cash+=y.cfo+y.cfi+y.cff;assert.ok(Math.abs(cash-y.cash)<1e-8)}});test('unbalanced opening data rejected',()=>assert.throws(()=>statementModel({...x,equity:0})));
