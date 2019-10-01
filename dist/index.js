'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var defaultMarkdownDict = {
  BOLD: '__',
  ITALIC: '*'
};

var blockStyleDict = {
  'unordered-list-item': '- ',
  'header-one': '# ',
  'header-two': '## ',
  'header-three': '### ',
  'header-four': '#### ',
  'header-five': '##### ',
  'header-six': '###### ',
  blockquote: '> '
};

var wrappingBlockStyleDict = {
  'code-block': '```'
};

var getBlockStyle = function getBlockStyle(currentStyle, appliedBlockStyles) {
  if (currentStyle === 'ordered-list-item') {
    var counter = appliedBlockStyles.reduce(function (prev, style) {
      if (style === 'ordered-list-item') {
        return prev + 1;
      }
      return prev;
    }, 1);
    return counter + '. ';
  }
  return blockStyleDict[currentStyle] || '';
};

var applyWrappingBlockStyle = function applyWrappingBlockStyle(currentStyle, content) {
  if (currentStyle in wrappingBlockStyleDict) {
    var wrappingSymbol = wrappingBlockStyleDict[currentStyle];
    return wrappingSymbol + '\n' + content + '\n' + wrappingSymbol;
  }

  return content;
};

var applyAtomicStyle = function applyAtomicStyle(block, entityMap, content) {
  if (block.type !== 'atomic') return content;
  // strip the test that was added in the media block
  var strippedContent = content.substring(0, content.length - block.text.length);
  var key = block.entityRanges[0].key;
  var type = entityMap[key].type;
  var data = entityMap[key].data;
  if (type === 'draft-js-video-plugin-video') {
    return strippedContent + '[[ embed url=' + (data.url || data.src) + ' ]]';
  }
  return strippedContent + '![' + (data.fileName || '') + '](' + (data.url || data.src) + ')';
};

var getEntityStart = function getEntityStart(entity) {
  switch (entity.type) {
    case 'LINK':
      return '[';
    default:
      return '';
  }
};

var getEntityEnd = function getEntityEnd(entity) {
  switch (entity.type) {
    case 'LINK':
      return '](' + entity.data.url + ')';
    default:
      return '';
  }
};

function fixWhitespacesInsideStyle(text, style) {
  var symbol = style.symbol;

  // Text before style-opening marker (including the marker)

  var pre = text.slice(0, style.range.start);
  // Text between opening and closing markers
  var body = text.slice(style.range.start, style.range.end);
  // Trimmed text between markers
  var bodyTrimmed = body.trim();
  // Text after closing marker
  var post = text.slice(style.range.end);

  var bodyTrimmedStart = style.range.start + body.indexOf(bodyTrimmed);

  // Text between opening marker and trimmed content (leading spaces)
  var prefix = text.slice(style.range.start, bodyTrimmedStart);
  // Text between the end of trimmed content and closing marker (trailing spaces)
  var postfix = text.slice(bodyTrimmedStart + bodyTrimmed.length, style.range.end);

  // Temporary text that contains trimmed content wrapped into original pre- and post-texts
  var newText = '' + pre + bodyTrimmed + post;
  // Insert leading and trailing spaces between pre-/post- contents and their respective markers
  return newText.replace('' + symbol + bodyTrimmed + symbol, '' + prefix + symbol + bodyTrimmed + symbol + postfix);
}

function getInlineStyleRangesByLength(inlineStyleRanges) {
  return [].concat(_toConsumableArray(inlineStyleRanges)).sort(function (a, b) {
    return b.length - a.length;
  });
}

function draftjsToMd(raw, extraMarkdownDict) {
  var markdownDict = _extends({}, defaultMarkdownDict, extraMarkdownDict);
  var appliedBlockStyles = [];

  return raw.blocks.map(function (block) {
    // totalOffset is a difference of index position between raw string and enhanced ones
    var totalOffset = 0;
    var returnString = '';

    // add block style
    returnString += getBlockStyle(block.type, appliedBlockStyles);
    appliedBlockStyles.push(block.type);

    var appliedStyles = [];
    returnString += block.text.split('').reduce(function (text, currentChar, index) {
      var newText = text;

      var sortedInlineStyleRanges = getInlineStyleRangesByLength(block.inlineStyleRanges);

      // find all styled at this character
      var stylesStartAtChar = sortedInlineStyleRanges.filter(function (range) {
        return range.offset === index;
      }).filter(function (range) {
        return markdownDict[range.style];
      }); // disregard styles not defined in the md dict

      // add the symbol to the md string and push the style in the applied styles stack
      stylesStartAtChar.forEach(function (currentStyle) {
        var symbolLength = markdownDict[currentStyle.style].length;
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
      var entitiesStartAtChar = block.entityRanges.filter(function (range) {
        return range.offset === index;
      });
      entitiesStartAtChar.forEach(function (entity) {
        newText += getEntityStart(raw.entityMap[entity.key]);
      });

      // add the current character to the md string
      newText += currentChar;

      // check for entityRanges ending and add if existing
      var entitiesEndAtChar = block.entityRanges.filter(function (range) {
        return range.offset + range.length - 1 === index;
      });
      entitiesEndAtChar.forEach(function (entity) {
        newText += getEntityEnd(raw.entityMap[entity.key]);
      });

      // apply the 'ending' tags for any styles that end in the current position in order (stack)
      while (appliedStyles.length !== 0 && appliedStyles[appliedStyles.length - 1].end === index) {
        var endingStyle = appliedStyles.pop();
        newText += endingStyle.symbol;

        newText = fixWhitespacesInsideStyle(newText, endingStyle);
        totalOffset += endingStyle.symbol.length;
      }

      return newText;
    }, '');

    returnString = applyWrappingBlockStyle(block.type, returnString);
    returnString = applyAtomicStyle(block, raw.entityMap, returnString);

    return returnString;
  }).join('\n');
}

module.exports.draftjsToMd = draftjsToMd;
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var parse = require('@textlint/markdown-to-ast').parse;

var defaultInlineStyles = {
  Strong: {
    type: 'BOLD',
    symbol: '__'
  },
  Emphasis: {
    type: 'ITALIC',
    symbol: '*'
  }
};

var defaultBlockStyles = {
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

var isAnyChildAnImage = function isAnyChildAnImage(children) {
  var bImage = false;
  for (var i = 0; i < children.length; i++) {
    if (child.type === 'Image') {
      bImage = true;
      break;
    }
  }
  return bImage;
};

var getBlockStyleForMd = function getBlockStyleForMd(node, blockStyles) {
  var style = node.type;
  var ordered = node.ordered;
  var depth = node.depth;
  if (style === 'List' && ordered) {
    return 'ordered-list-item';
  } else if (style === 'Header') {
    return blockStyles['' + style + depth];
  } else if (node.type === 'Paragraph' && node.children && node.children[0] && isAnyChildAnImage(node.children)) {
    return 'atomic';
  } else if (node.type === 'Paragraph' && node.raw && node.raw.match(/^\[\[\s\S+\s.*\S+\s\]\]/)) {
    return 'atomic';
  }
  return blockStyles[style];
};

var joinCodeBlocks = function joinCodeBlocks(splitMd) {
  var opening = splitMd.indexOf('```');
  var closing = splitMd.indexOf('```', opening + 1);

  if (opening >= 0 && closing >= 0) {
    var codeBlock = splitMd.slice(opening, closing + 1);
    var codeBlockJoined = codeBlock.join('\n');
    var updatedSplitMarkdown = [].concat(_toConsumableArray(splitMd.slice(0, opening)), [codeBlockJoined], _toConsumableArray(splitMd.slice(closing + 1)));

    return joinCodeBlocks(updatedSplitMarkdown);
  }

  return splitMd;
};

var splitMdBlocks = function splitMdBlocks(md) {
  var splitMd = md.split('\n');

  // Process the split markdown include the
  // one syntax where there's an block level opening
  // and closing symbol with content in the middle.
  var splitMdWithCodeBlocks = joinCodeBlocks(splitMd);
  return splitMdWithCodeBlocks;
};

var parseMdLine = function parseMdLine(line, existingEntities) {
  var extraStyles = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

  var inlineStyles = _extends({}, defaultInlineStyles, extraStyles.inlineStyles);
  var blockStyles = _extends({}, defaultBlockStyles, extraStyles.blockStyles);

  var astString = parse(line);
  var text = '';
  var inlineStyleRanges = [];
  var entityRanges = [];
  var entityMap = existingEntities;

  var addInlineStyleRange = function addInlineStyleRange(offset, length, style) {
    inlineStyleRanges.push({ offset: offset, length: length, style: style });
  };

  var getRawLength = function getRawLength(children) {
    return children.reduce(function (prev, current) {
      return prev + (current.value ? current.value.length : 0);
    }, 0);
  };

  var addLink = function addLink(child) {
    var entityKey = Object.keys(entityMap).length;
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

  var addImage = function addImage(child) {
    var entityKey = Object.keys(entityMap).length;
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

  var addVideo = function addVideo(child) {
    var string = child.raw;

    // RegEx: [[ embed url=<anything> ]]
    var url = string.match(/^\[\[\s(?:embed)\s(?:url=(\S+))\s\]\]/)[1];

    var entityKey = Object.keys(entityMap).length;
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

  var parseChildren = function parseChildren(child, style) {
    // RegEx: [[ embed url=<anything> ]]
    var videoShortcodeRegEx = /^\[\[\s(?:embed)\s(?:url=(\S+))\s\]\]/;
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
      var rawLength = getRawLength(child.children);
      addInlineStyleRange(text.length, rawLength, style.type);
      var newStyle = inlineStyles[child.type];
      child.children.forEach(function (grandChild) {
        parseChildren(grandChild, newStyle);
      });
    } else if (!videoShortcodeRegEx.test(child.raw) && child.children) {
      var _newStyle = inlineStyles[child.type];
      child.children.forEach(function (grandChild) {
        parseChildren(grandChild, _newStyle);
      });
    } else {
      if (style) {
        addInlineStyleRange(text.length, child.value.length, style.type);
      }
      if (inlineStyles[child.type]) {
        addInlineStyleRange(text.length, child.value.length, inlineStyles[child.type].type);
      }
      text = '' + text + (child.type === 'Image' || videoShortcodeRegEx.test(child.raw) ? ' ' : child.value);
    }
  };

  astString.children.forEach(function (child) {
    var style = inlineStyles[child.type];
    parseChildren(child, style);
  });

  // add block style if it exists
  var blockStyle = 'unstyled';
  if (astString.children[0]) {
    var style = getBlockStyleForMd(astString.children[0], blockStyles);
    if (style) {
      blockStyle = style;
    }
  }

  return {
    text: text,
    inlineStyleRanges: inlineStyleRanges,
    entityRanges: entityRanges,
    blockStyle: blockStyle,
    entityMap: entityMap
  };
};

function mdToDraftjs(mdString, extraStyles) {
  var paragraphs = splitMdBlocks(mdString);
  var blocks = [];
  var entityMap = {};

  paragraphs.forEach(function (paragraph) {
    var result = parseMdLine(paragraph, entityMap, extraStyles);
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
    blocks: blocks,
    entityMap: entityMap
  };
}

module.exports.mdToDraftjs = mdToDraftjs;
