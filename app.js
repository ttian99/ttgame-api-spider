const puppeteer = require('puppeteer');
const cfg = require('./lib/cfg');
const fs = require('fs');
const axios = require('axios');
const _ = require('lodash');

/** 小游戏首页 */
const DOMAIN = 'https://microapp.bytedance.com';
// const url = 'https://microapp.bytedance.com/dev/page-data/cn/mini-game/develop/api/mini-game/bytedance-mini-game/page-data.json';
const url = 'https://microapp.bytedance.com/dev/cn/mini-game/develop/api/mini-game/bytedance-mini-game';

/** 扁平化数组 */
let flatArr = [];

/** 获取浏览器对象 */
async function getBrowser() {
    return puppeteer.launch({
        timeout: 50000,
        ignoreHTTPSErrors: true,
        devtools: cfg.isDebug,
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
}

/** 主函数 */
async function main() {
    const browser = await getBrowser();
    const page = await browser.newPage();
    const apiList = await getApiList(page);
    saveFile('data.json', apiList);
    await getDetail(flatArr);
    browser.close();
}

/** 
 * 获取pageData路径
 * @example path: https://microapp.bytedance.com/dev/cn/mini-game/develop/api/drawing/picture/canvas
 * @example page-data: https://microapp.bytedance.com/dev/page-data/cn/mini-game/develop/api/drawing/picture/canvas/page-data.json
 */
function getPageDataUrl(url) {
    url = url.replace('/dev/', '/dev/page-data/');
    url = url + '/page-data.json';
    return url;
}
/**
 * 增加page-data-url
 * @param {*} list 
 */
async function formatUrls(list) {
    for (let i = 0; i < list.length; i++) {
        const data = list[i];
        data.pageDataUrl = getPageDataUrl(data.path);
    }
    return list;
}
/**
 * 获取详细的api文件
 * @param {*} flatArr 
 */
async function getDetail(flatArr) {
    const arr = await formatUrls(flatArr);
    saveFile('flatArr.json', arr);

    const url = `${DOMAIN}${arr[1].pageDataUrl}`;
    axios(url)
        .then(res => {
            console.log(res.data);
            saveFile('res.json', res.data);
        })
        .catch(err => console.error(err));
}


/** 获取api目录列表 */
async function getApiList(page) {
    // 访问主页
    console.log(`==== start goto ${url}`);
    await page.goto(url, { timeout: 500000 });
    console.log(`==== over goto ${url}`);
    await page.waitForResponse('https://s3.pstatp.com/toutiao/monitor/sdk/slardar.js');
    // 侧边栏所有目录
    let total = [];
    const arr = await page.$$('#gatsby-focus-wrapper > div > section > section > aside > div > div > div.byte-menu-inline');
    console.log(`共有${arr.length}个1级目录`);
    for (let i = 0; i < arr.length; i++) {
        let data = {};
        const element = arr[i];
        //获取一级目录
        const rootName = await getHeadName(element);
        data.name = rootName;
        data.id = i;
        //获取二级目录
        data.list = await getSecondDiv(element);

        total[i] = data;
    }
    return total;
}

/** 获取目录名字 */
async function getHeadName(element) {
    const rootName = await element.$eval('div.byte-menu-inline-header > span:nth-child(1) > span', e => e.innerHTML);
    return rootName;
}
/** 获取二级目录数据 */
async function getSecondDiv(element) {
    let dataList = [];
    const content = await element.$('div:nth-child(2)');
    const nodeArr = await content.$$('div.byte-menu-inline');

    // console.log('nodeArr', nodeArr.length);
    const len = nodeArr.length; //节点数量
    let data = {};
    if (len <= 0) {
        data.name = '默认';
        data.id = 0;
        data.arr = await getThirdItem(content);
        dataList[0] = data;
    } else {
        for (let i = 0; i < len; i++) {
            let data = {};
            const element = nodeArr[i];
            const name = await getHeadName(element);
            const content = await element.$('div:nth-child(2)');
            const arr = await getThirdItem(content);
            data.name = name;
            data.id = i;
            data.arr = arr;
            dataList[i] = data;
            // const desc = await element.$eval('div.byte-menu-inline-content.h-exit-done > div:nth-child(2) > span > a')
        }
    }
    return dataList;
}
/** 获取3级条目 */
async function getThirdItem(element) {
    const itemArr = await element.$$('div.byte-menu-item');
    // console.log(itemArr);
    let dataArr = []
    for (let i = 0; i < itemArr.length; i++) {
        const item = itemArr[i];
        const data = await getItemData(item);
        dataArr[i] = data;
    }
    flatArr = flatArr.concat(dataArr);
    return dataArr;
}
/** 获取单个条目具体数据 */
async function getItemData(item) {
    return item.$eval('span > a', e => {
        let data = {};
        data.name = e.innerHTML;
        data.path = e.getAttribute('href');
        return data;
    });
}

/** 保存文件 */
async function saveFile(filePath, data) {
    if (typeof data == 'object') {
        data = JSON.stringify(data, null, 4);
    }
    fs.writeFileSync(filePath, data, { encoding: 'utf-8' });
}

try {
    main();
} catch (error) {
    console.error(error);
}

