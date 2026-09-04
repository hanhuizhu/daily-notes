/**
 * 代码相似度计算工具
 * 从Java版本精确转换，保持算法完全一致
 */

const NUM_HASHES = 64;
const HASH_SEEDS = new Array(NUM_HASHES);

/**
 * 创建Java Random实例（精确复现Java的java.util.Random实现）
 * @param {number} seed - 随机种子
 * @returns {object} - 包含next和nextInt方法的对象
 */
function createJavaRandom(seed) {
  const multiplier = BigInt('0x5DEECE66D');
  const addend = BigInt(0xB);
  const mask = (BigInt(1) << BigInt(48)) - BigInt(1);

  // Java Random 初始化: (seed ^ multiplier) & mask
  let s = (BigInt(seed) ^ multiplier) & mask;

  return {
    /**
     * Java Random.next(bits) 方法
     * @param {number} bits - 需要的位数
     * @returns {number} - 随机数
     */
    next: function(bits) {
      s = (s * multiplier + addend) & mask;
      // Java: return (int)(seed >>> (48 - bits))
      const shift = 48 - bits;
      return Number(s >> BigInt(shift));
    },
    /**
     * Java Random.nextInt() 方法
     * @returns {number} - 有符号32位随机整数
     */
    nextInt: function() {
      return this.next(32) | 0; // 转为有符号32位整数
    }
  };
}

// 静态初始化块 - 使用固定种子生成哈希种子数组
(function initSeeds() {
  const r = createJavaRandom(42);
  for (let i = 0; i < NUM_HASHES; i++) {
    HASH_SEEDS[i] = r.nextInt();
  }
})();

/**
 * 将代码行分词
 * @param {string} codeLine - 代码行
 * @returns {Set<string>} - 分词结果集合
 */
function tokenize(codeLine) {
  /* genAI_hooks_start */
  // 使用 Unicode 属性匹配，等同于 Java 的 [^\p{L}0-9_]+
  const tokens = codeLine.split(/[^\p{L}0-9_]+/u);
  /* genAI_hooks_end */
  const result = new Set();
  for (const token of tokens) {
    if (token && token.trim()) {
      result.add(token.toLowerCase());
    }
  }
  return result;
}

/**
 * Long.rotateLeft 的JavaScript实现
 * @param {bigint} value - 64位值
 * @param {number} distance - 旋转距离
 * @returns {bigint} - 旋转后的值
 */
function rotateLeft64(value, distance) {
  const mask64 = BigInt('0xFFFFFFFFFFFFFFFF');
  value = value & mask64;
  distance = distance & 63;
  return ((value << BigInt(distance)) | (value >> BigInt(64 - distance))) & mask64;
}

/**
 * 将BigInt转换为有符号64位整数
 * @param {bigint} value - 无符号BigInt值
 * @returns {bigint} - 有符号64位整数
 */
function toSigned64(value) {
  const mask64 = BigInt('0xFFFFFFFFFFFFFFFF');
  value = value & mask64;
  if (value >= BigInt('0x8000000000000000')) {
    return value - BigInt('0x10000000000000000');
  }
  return value;
}

/**
 * 无符号右移64位
 * @param {bigint} value - 64位值
 * @param {number} shift - 移位距离
 * @returns {bigint} - 移位后的值
 */
function unsignedRightShift64(value, shift) {
  const mask64 = BigInt('0xFFFFFFFFFFFFFFFF');
  return (value & mask64) >> BigInt(shift);
}

/**
 * MurmurHash64实现 - 与Java版本完全一致
 * @param {string} input - 输入字符串
 * @param {number} seed - 哈希种子
 * @returns {bigint} - 64位哈希值
 */
function murmurHash64(input, seed) {
  const data = new TextEncoder().encode(input);
  const length = data.length;
  const nblocks = length >> 3;

  const mask64 = BigInt('0xFFFFFFFFFFFFFFFF');
  /* genAI_hooks_start */
  // Java: long h1 = seed; 会将int符号扩展到long
  // 需要模拟Java的符号扩展行为：将32位有符号int扩展为64位有符号long
  // 然后转为无符号64位进行位运算
  let h1 = BigInt(seed);
  if (h1 < 0) {
    // 负数需要转为64位无符号表示
    h1 = h1 & mask64;
  }
  /* genAI_hooks_end */

  const c1 = BigInt('0x87c37b91114253d5');
  const c2 = BigInt('0x4cf5ad432745937f');

  // body
  for (let i = 0; i < nblocks; i++) {
    const i8 = i << 3;
    let k1 = BigInt(0);
    for (let j = 0; j < 8; j++) {
      k1 |= (BigInt(data[i8 + j] & 0xff)) << BigInt(j * 8);
    }

    k1 = (k1 * c1) & mask64;
    k1 = rotateLeft64(k1, 31);
    k1 = (k1 * c2) & mask64;

    h1 ^= k1;
    h1 = rotateLeft64(h1, 27);
    h1 = (h1 * BigInt(5) + BigInt(0x52dce729)) & mask64;
  }

  /* genAI_hooks_start */
  // tail
  let k1 = BigInt(0);
  const tailStart = nblocks << 3;
  const tailLen = length & 7;

  // Java的switch fall-through行为
  // 注意：Java的byte是有符号的，(long)byte会符号扩展
  // 但在tail部分，Java代码直接 (long) data[i] << N，没有 & 0xff
  // 所以需要模拟Java的有符号byte到long的符号扩展
  function byteToSignedLong(b) {
    // 将无符号byte (0-255) 转为Java的有符号byte (-128 to 127) 再符号扩展到long
    if (b > 127) {
      // 负数：符号扩展
      return BigInt(b) - BigInt(256);
    }
    return BigInt(b);
  }

  if (tailLen >= 7) k1 ^= byteToSignedLong(data[tailStart + 6]) << BigInt(48);
  if (tailLen >= 6) k1 ^= byteToSignedLong(data[tailStart + 5]) << BigInt(40);
  if (tailLen >= 5) k1 ^= byteToSignedLong(data[tailStart + 4]) << BigInt(32);
  if (tailLen >= 4) k1 ^= byteToSignedLong(data[tailStart + 3]) << BigInt(24);
  if (tailLen >= 3) k1 ^= byteToSignedLong(data[tailStart + 2]) << BigInt(16);
  if (tailLen >= 2) k1 ^= byteToSignedLong(data[tailStart + 1]) << BigInt(8);
  if (tailLen >= 1) {
    k1 ^= byteToSignedLong(data[tailStart]);
    k1 = (k1 * c1) & mask64;
    k1 = rotateLeft64(k1, 31);
    k1 = (k1 * c2) & mask64;
    h1 ^= k1;
  }
  /* genAI_hooks_end */

  // finalization
  h1 ^= BigInt(length);
  h1 = unsignedRightShift64(h1, 33) ^ h1;
  h1 = (h1 * BigInt('0xff51afd7ed558ccd')) & mask64;
  h1 = unsignedRightShift64(h1, 33) ^ h1;
  h1 = (h1 * BigInt('0xc4ceb9fe1a85ec53')) & mask64;
  h1 = unsignedRightShift64(h1, 33) ^ h1;

  return toSigned64(h1);
}

/**
 * 将token集合转为64位压缩指纹
 * @param {Set<string>} tokens - token集合
 * @returns {bigint} - 64位压缩指纹
 */
function computeCompressedFingerprint(tokens) {
  const minHashes = new Array(NUM_HASHES);
  // Java的Long.MAX_VALUE
  const LONG_MAX_VALUE = BigInt('9223372036854775807');

  for (let i = 0; i < NUM_HASHES; i++) {
    minHashes[i] = LONG_MAX_VALUE;
  }

  for (const token of tokens) {
    for (let i = 0; i < NUM_HASHES; i++) {
      const h = murmurHash64(token, HASH_SEEDS[i]);
      if (h < minHashes[i]) {
        minHashes[i] = h;
      }
    }
  }

  /* genAI_hooks_start */
  // 以第一个token的hash作为baseline，构造BitSet：是否最小
  let compressed = BigInt(0);
  for (let i = 0; i < NUM_HASHES; i++) {
    // Java的 long % 2 对于负数返回 -1 或 0
    // -4 % 2 = 0 (偶数), -5 % 2 = -1 (奇数)
    // 与Java保持一致：只有 % 2 === 0 时才设置位
    if (minHashes[i] % BigInt(2) === BigInt(0)) {
      compressed |= (BigInt(1) << BigInt(i));
    }
  }
  // 将无符号BigInt转换为有符号64位整数（与Java long一致）
  return toSigned64(compressed);
  /* genAI_hooks_end */
}

/* genAI_hooks_start */
function computeCodeHash(codeLine) {
  const tokens = tokenize(codeLine);
  if (tokens.size === 0) {
    return '0';
  }
  return computeCompressedFingerprint(tokens).toString();
}
/* genAI_hooks_end */

// 导出模块（Node.js CommonJS 格式）
module.exports = {
  computeCodeHash
};

// 用法示例
// const hash = computeCodeHash("/**");
// console.log(hash);


