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

/** 请求page-data.json文件 */
async function req(pageDataUrl) {

    try {
        const url = `${DOMAIN}${pageDataUrl}`;
        const res = await axios(url);
        const data = res.data;
        console.log(data);
        const wiki = data.path;
        console.log('wiki = ' + wiki);
        const dec = `/** @wiki ${wiki} */`;

        const htmlAst = data.result.data.markdownRemark.htmlAst;
        const eleArr = htmlAst.children;
        let srcArr = [];
        let newArr = [];
        for (let i = 0; i < eleArr.length; i++) {
            const element = eleArr[i];
            // 只提取element元素
            if (element.type == 'element') {
                srcArr.push(element);
                let value = getElementTxt(element);
                value = value.replace(/\n/ig, ''); //去掉换行
                const properties = element.properties
                let elementData = { tagName: element.tagName, value };
                if (properties) {
                    elementData.properties = properties;
                }
                newArr.push(elementData);
            }
        }
        // saveFile('srcArr.json', srcArr);
        // saveFile('newArr.json', newArr);

        // getDefineStr(newArr);
        return newArr;
    } catch (error) {
        console.log('error url: ' + url);
        console.error(error);
        return [];
    }

    // axios(url)
    //     .then(res => {
    //         // console.log(res.data);
    //         const data = res.data;
    //         console.log(data);
    //         const wiki = data.path;
    //         console.log('wiki = ' + wiki);
    //         const dec = `/** @wiki ${wiki} */`;

    //         const htmlAst = data.result.data.markdownRemark.htmlAst;
    //         const eleArr = htmlAst.children;
    //         let srcArr = [];
    //         let newArr = [];
    //         for (let i = 0; i < eleArr.length; i++) {
    //             const element = eleArr[i];
    //             // 只提取element元素
    //             if (element.type == 'element') {
    //                 srcArr.push(element);
    //                 let value = getElementTxt(element);
    //                 value = value.replace(/\n/ig, ''); //去掉换行
    //                 newArr.push({ tagName: element.tagName, value });
    //             }
    //         }
    //         // saveFile('srcArr.json', srcArr);
    //         saveFile('newArr.json', newArr);

    //         getDefineStr(newArr);

    //         // insert(dec, inner);
    //         // const define = `declare namespace tt {${inner}}`;
    //         // saveFile('ttgame.d.ts', define);
    //     })
    //     .catch(err => console.error(err));

}
/**
 * 获取详细的api文件
 * @param {*} flatArr 
 */
async function getDetail(flatArr) {
    const arr = await formatUrls(flatArr);
    saveFile('flatArr.json', arr);
    
    let dataArr = [];
    for (let index = 0; index < arr.length; index++) {
        const data = arr[index];
        const eleArr = await req(data.pageDataUrl);
        dataArr[index] = eleArr;
    }

    saveFile('dataArr.json', dataArr);
}

/** 插入字符串 */
function insert(str, dest) {
    dest += '\n' + str + '\n';
}

/** 获取element的文本内容 */
function getElementTxt(element) {
    let txt = '';
    const arr = element.children;
    if (element.tagName == 'h1') {
        txt = arr[1].value;
        return txt;
    }
    for (let i = 0; i < arr.length; i++) {
        const subElement = arr[i];
        if (subElement.type == 'element') {
            txt += getElementTxt(subElement);
        } else {
            txt += subElement.value || '';
        }
    }
    return txt;
}

/** 获取定义字符串 */
function getDefineStr(arr) {
    // const temp = {
    //     1: 'function createCanvas(M): void',
    //     2: 'interface N {M}',
    //     3: 'declare function',
    // }
    const firstNode = arr[0];
    let txt = firstNode.value;
    // 是tt的方法
    if (/^tt./i.test(txt)) {
        type = 1;
        console.log('是tt的方法');
        const funcName = txt.replace('tt.', '');
    } else {
        // 是子对象的方法
        if (/./ig.test(txt)) {
            console.log('是子对象的方法');
            type = 2;
            const txtArr = txt.split('.');
            const objName = txtArr[0];
            const objFuncName = txtArr[1];
            // str = `function ${funcName}()`
        } else {
            // 是全局方法
            type = 3;
            console.log('是全局方法');
            const globalFuncName = txt;
        }
    }
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


/**
 * 页面结构会遇到的标签
 * h1 - tt方法名、子对象名、子对象方法名
 * blockqute - 块引用
 * p - 内容描述
 * h2 - 属性 参数|输入  输出|返回|返回值  代码示例
 * h3 - 具体的属性方法描述了
 *
 */