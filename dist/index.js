'use strict';

var _extends =
  Object.assign ||
  function(target) {
    for (let i = 1; i < arguments.length; i++) {
      const source = arguments[i];
      for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          target[key] = source[key];
        }
      }
    }
    return target;
  };

function _toConsumableArray(arr) {
  if (Array.isArray(arr)) {
    for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) {
      arr2[i] = arr[i];
    }
    return arr2;
  }
  return Array.from(arr);
}

const defaultMarkdownDict = {
  BOLD: '__',
  ITALIC: '*'
};

const blockStyleDict = {
  'unordered-list-item': '- ',
  'header-one': '# ',
  'header-two': '## ',
  'header-three': '### ',
  'header-four': '#### ',
  'header-five': '##### ',
  'header-six': '###### ',
  blockquote: '> '
};

const wrappingBlockStyleDict = {
  'code-block': '```'
};

const getBlockStyle = function getBlockStyle(currentStyle, appliedBlockStyles) {
  if (currentStyle === 'ordered-list-item') {
    const counter = appliedBlockStyles.reduce((prev, style) => {
      if (style === 'ordered-list-item') {
        return prev + 1;
      }
      return prev;
    }, 1);
    return `${counter}. `;
  }
  return blockStyleDict[currentStyle] || '';
};

const applyWrappingBlockStyle = function applyWrappingBlockStyle(currentStyle, content) {
  if (currentStyle in wrappingBlockStyleDict) {
    const wrappingSymbol = wrappingBlockStyleDict[currentStyle];
    return `${wrappingSymbol}\n${content}\n${wrappingSymbol}`;
  }

  return content;
};

const applyAtomicStyle = function applyAtomicStyle(block, entityMap, content) {
  if (block.type !== 'atomic') return content;
  // strip the test that was added in the media block
  const strippedContent = content.substring(0, content.length - block.text.length);
  const key = block.entityRanges[0].key;
  const type = entityMap[key].type;
  const data = entityMap[key].data;
  if (type === 'draft-js-video-plugin-video') {
    return `${strippedContent}[[ embed url=${data.url || data.src} ]]`;
  }
  return `${strippedContent}![${data.fileName || ''}](${data.url || data.src})`;
};

const getEntityStart = function getEntityStart(entity) {
  switch (entity.type) {
    case 'LINK':
      return '[';
    default:
      return '';
  }
};

const getEntityEnd = function getEntityEnd(entity) {
  switch (entity.type) {
    case 'LINK':
      return `](${entity.data.url})`;
    default:
      return '';
  }
};

function fixWhitespacesInsideStyle(text, style) {
  const symbol = style.symbol;

  // Text before style-opening marker (including the marker)

  const pre = text.slice(0, style.range.start);
  // Text between opening and closing markers
  const body = text.slice(style.range.start, style.range.end);
  // Trimmed text between markers
  const bodyTrimmed = body.trim();
  // Text after closing marker
  const post = text.slice(style.range.end);

  const bodyTrimmedStart = style.range.start + body.indexOf(bodyTrimmed);

  // Text between opening marker and trimmed content (leading spaces)
  const prefix = text.slice(style.range.start, bodyTrimmedStart);
  // Text between the end of trimmed content and closing marker (trailing spaces)
  const postfix = text.slice(bodyTrimmedStart + bodyTrimmed.length, style.range.end);

  // Temporary text that contains trimmed content wrapped into original pre- and post-texts
  const newText = `${pre}${bodyTrimmed}${post}`;
  // Insert leading and trailing spaces between pre-/post- contents and their respective markers
  return newText.replace(
    `${symbol}${bodyTrimmed}${symbol}`,
    `${prefix}${symbol}${bodyTrimmed}${symbol}${postfix}`
  );
}

function getInlineStyleRangesByLength(inlineStyleRanges) {
  return [].concat(_toConsumableArray(inlineStyleRanges)).sort((a, b) => b.length - a.length);
}

function draftjsToMd(raw, extraMarkdownDict) {
  const markdownDict = _extends({}, defaultMarkdownDict, extraMarkdownDict);
  const appliedBlockStyles = [];

  return raw.blocks
    .map(block => {
      // totalOffset is a difference of index position between raw string and enhanced ones
      let totalOffset = 0;
      let returnString = '';

      // add block style
      returnString += getBlockStyle(block.type, appliedBlockStyles);
      appliedBlockStyles.push(block.type);

      const appliedStyles = [];
      returnString += block.text.split('').reduce((text, currentChar, index) => {
        let newText = text;

        const sortedInlineStyleRanges = getInlineStyleRangesByLength(block.inlineStyleRanges);

        // find all styled at this character
        const stylesStartAtChar = sortedInlineStyleRanges
          .filter(range => range.offset === index)
          .filter(range => markdownDict[range.style]); // disregard styles not defined in the md dict

        // add the symbol to the md string and push the style in the applied styles stack
        stylesStartAtChar.forEach(currentStyle => {
          const symbolLength = markdownDict[currentStyle.style].length;
          newText += markdownDict[currentStyle.style];
          totalOffset += symbolLength;
          appliedStyles.push({
            symbol: markdownDict[currentStyle.style],
            range: {
              start: currentStyle.offset + totalOffset,
              end: currentStyle.offset + currentStyle.length + totalOffset
            },
            end: currentStyle.offset + (currentStyle.length - 1)
          });
        });

        // check for entityRanges starting and add if existing
        const entitiesStartAtChar = block.entityRanges.filter(range => range.offset === index);
        entitiesStartAtChar.forEach(entity => {
          newText += getEntityStart(raw.entityMap[entity.key]);
        });

        // add the current character to the md string
        newText += currentChar;

        // check for entityRanges ending and add if existing
        const entitiesEndAtChar = block.entityRanges.filter(
          range => range.offset + range.length - 1 === index
        );
        entitiesEndAtChar.forEach(entity => {
          newText += getEntityEnd(raw.entityMap[entity.key]);
        });

        // apply the 'ending' tags for any styles that end in the current position in order (stack)
        while (
          appliedStyles.length !== 0 &&
          appliedStyles[appliedStyles.length - 1].end === index
        ) {
          const endingStyle = appliedStyles.pop();
          newText += endingStyle.symbol;

          newText = fixWhitespacesInsideStyle(newText, endingStyle);
          totalOffset += endingStyle.symbol.length;
        }

        return newText;
      }, '');

      returnString = applyWrappingBlockStyle(block.type, returnString);
      returnString = applyAtomicStyle(block, raw.entityMap, returnString);

      return returnString;
    })
    .join('\n');
}

module.exports.draftjsToMd = draftjsToMd;
('use strict');

var _extends =
  Object.assign ||
  function(target) {
    for (let i = 1; i < arguments.length; i++) {
      const source = arguments[i];
      for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          target[key] = source[key];
        }
      }
    }
    return target;
  };

function _toConsumableArray(arr) {
  if (Array.isArray(arr)) {
    for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) {
      arr2[i] = arr[i];
    }
    return arr2;
  }
  return Array.from(arr);
}

const parse = require('@textlint/markdown-to-ast').parse;

const defaultInlineStyles = {
  Strong: {
    type: 'BOLD',
    symbol: '__'
  },
  Emphasis: {
    type: 'ITALIC',
    symbol: '*'
  }
};

const defaultBlockStyles = {
  List: 'unordered-list-item',
  Header1: 'header-one',
  Header2: 'header-two',
  Header3: 'header-three',
  Header4: 'header-four',
  Header5: 'header-five',
  Header6: 'header-six',
  CodeBlock: 'code-block',
  BlockQuote: 'blockquote'
};

const isAnyChildAnImage = function isAnyChildAnImage(children) {
  let bImage = false;
  for (let i = 0; i < children.length; i++) {
    if (child.type === 'Image') {
      bImage = true;
      break;
    }
  }
  return bImage;
};

const getBlockStyleForMd = function getBlockStyleForMd(node, blockStyles) {
  const style = node.type;
  const ordered = node.ordered;
  const depth = node.depth;
  if (style === 'List' && ordered) {
    return 'ordered-list-item';
  } else if (style === 'Header') {
    return blockStyles[`${style}${depth}`];
  } else if (
    node.type === 'Paragraph' &&
    node.children &&
    node.children[0] &&
    isAnyChildAnImage(node.children)
  ) {
    return 'atomic';
  } else if (node.type === 'Paragraph' && node.raw && node.raw.match(/^\[\[\s\S+\s.*\S+\s\]\]/)) {
    return 'atomic';
  }
  return blockStyles[style];
};

const joinCodeBlocks = function joinCodeBlocks(splitMd) {
  const opening = splitMd.indexOf('```');
  const closing = splitMd.indexOf('```', opening + 1);

  if (opening >= 0 && closing >= 0) {
    const codeBlock = splitMd.slice(opening, closing + 1);
    const codeBlockJoined = codeBlock.join('\n');
    const updatedSplitMarkdown = [].concat(
      _toConsumableArray(splitMd.slice(0, opening)),
      [codeBlockJoined],
      _toConsumableArray(splitMd.slice(closing + 1))
    );

    return joinCodeBlocks(updatedSplitMarkdown);
  }

  return splitMd;
};

const splitMdBlocks = function splitMdBlocks(md) {
  const splitMd = md.split('\n');

  // Process the split markdown include the
  // one syntax where there's an block level opening
  // and closing symbol with content in the middle.
  const splitMdWithCodeBlocks = joinCodeBlocks(splitMd);
  return splitMdWithCodeBlocks;
};

const parseMdLine = function parseMdLine(line, existingEntities) {
  const extraStyles = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

  const inlineStyles = _extends({}, defaultInlineStyles, extraStyles.inlineStyles);
  const blockStyles = _extends({}, defaultBlockStyles, extraStyles.blockStyles);

  const astString = parse(line);
  let text = '';
  const inlineStyleRanges = [];
  const entityRanges = [];
  const entityMap = existingEntities;

  const addInlineStyleRange = function addInlineStyleRange(offset, length, style) {
    inlineStyleRanges.push({ offset, length, style });
  };

  const getRawLength = function getRawLength(children) {
    return children.reduce((prev, current) => prev + (current.value ? current.value.length : 0), 0);
  };

  const addLink = function addLink(child) {
    const entityKey = Object.keys(entityMap).length;
    entityMap[entityKey] = {
      type: 'LINK',
      mutability: 'MUTABLE',
      data: {
        url: child.url
      }
    };
    entityRanges.push({
      key: entityKey,
      length: getRawLength(child.children),
      offset: text.length
    });
  };

  const addImage = function addImage(child) {
    const entityKey = Object.keys(entityMap).length;
    entityMap[entityKey] = {
      type: 'IMAGE',
      mutability: 'IMMUTABLE',
      data: {
        url: child.url,
        src: child.url,
        fileName: child.alt || ''
      }
    };
    entityRanges.push({
      key: entityKey,
      length: 1,
      offset: text.length ? text.length - 1 : text.length
    });
  };

  const addVideo = function addVideo(child) {
    const string = child.raw;

    // RegEx: [[ embed url=<anything> ]]
    const url = string.match(/^\[\[\s(?:embed)\s(?:url=(\S+))\s\]\]/)[1];

    const entityKey = Object.keys(entityMap).length;
    entityMap[entityKey] = {
      type: 'draft-js-video-plugin-video',
      mutability: 'IMMUTABLE',
      data: {
        src: url
      }
    };
    entityRanges.push({
      key: entityKey,
      length: 1,
      offset: text.length
    });
  };

  const parseChildren = function parseChildren(child, style) {
    // RegEx: [[ embed url=<anything> ]]
    const videoShortcodeRegEx = /^\[\[\s(?:embed)\s(?:url=(\S+))\s\]\]/;
    switch (child.type) {
      case 'Link':
        addLink(child);
        break;
      case 'Image':
        addImage(child);
        break;
      case 'Paragraph':
        if (videoShortcodeRegEx.test(child.raw)) {
          addVideo(child);
        }
        break;
      default:
    }

    if (!videoShortcodeRegEx.test(child.raw) && child.children && style) {
      const rawLength = getRawLength(child.children);
      addInlineStyleRange(text.length, rawLength, style.type);
      const newStyle = inlineStyles[child.type];
      child.children.forEach(grandChild => {
        parseChildren(grandChild, newStyle);
      });
    } else if (!videoShortcodeRegEx.test(child.raw) && child.children) {
      const _newStyle = inlineStyles[child.type];
      child.children.forEach(grandChild => {
        parseChildren(grandChild, _newStyle);
      });
    } else {
      if (style) {
        addInlineStyleRange(text.length, child.value.length, style.type);
      }
      if (inlineStyles[child.type]) {
        addInlineStyleRange(text.length, child.value.length, inlineStyles[child.type].type);
      }
      text = `${text}${
        child.type === 'Image' || videoShortcodeRegEx.test(child.raw) ? ' ' : child.value
      }`;
    }
  };

  astString.children.forEach(child => {
    const style = inlineStyles[child.type];
    parseChildren(child, style);
  });

  // add block style if it exists
  let blockStyle = 'unstyled';
  if (astString.children[0]) {
    const style = getBlockStyleForMd(astString.children[0], blockStyles);
    if (style) {
      blockStyle = style;
    }
  }

  return {
    text,
    inlineStyleRanges,
    entityRanges,
    blockStyle,
    entityMap
  };
};

function mdToDraftjs(mdString, extraStyles) {
  const paragraphs = splitMdBlocks(mdString);
  const blocks = [];
  let entityMap = {};

  paragraphs.forEach(paragraph => {
    const result = parseMdLine(paragraph, entityMap, extraStyles);
    blocks.push({
      text: result.text,
      type: result.blockStyle,
      depth: 0,
      inlineStyleRanges: result.inlineStyleRanges,
      entityRanges: result.entityRanges
    });
    entityMap = result.entityMap;
  });

  // add a default value
  // not sure why that's needed but Draftjs convertToRaw fails without it
  if (Object.keys(entityMap).length === 0) {
    entityMap = {
      data: '',
      mutability: '',
      type: ''
    };
  }
  return {
    blocks,
    entityMap
  };
}

module.exports.mdToDraftjs = mdToDraftjs;
