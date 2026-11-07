const { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } = require('crypto')
const { readFileSync, writeFileSync } = require('fs')

// usage: node scripts/release/update-signature.js sign <file>     writes <file>.sig, signed with the private key in UPDATE_SIGNING_KEY (PEM)
//        node scripts/release/update-signature.js check <file>    checks <file>.sig against the public keys of shared/constants/update-keys.ts
//        node scripts/release/update-signature.js generate        prints a new key pair: the PEM for the secret, the base64 for update-keys.ts
// the macOS app checks the signature of latest-mac.yml, which lists the sha512 of each zip. See docs/app/updater.md
const signText = (text, privateKeyPem) => sign(undefined, Buffer.from(text), createPrivateKey(privateKeyPem)).toString('base64')

const verifyText = (text, signature, publicKeyBase64) =>
  verify(undefined, Buffer.from(text), createPublicKey({ key: Buffer.from(publicKeyBase64, 'base64'), format: 'der', type: 'spki' }), Buffer.from(signature, 'base64'))

const generateKeys = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  }
}

// the keys are read from the TypeScript file, which the release job has no compiler for
const readPublicKeys = () => [...readFileSync(require('path').join(__dirname, '../../shared/constants/update-keys.ts'), 'utf8').matchAll(/'([A-Za-z0-9+/=]{20,})'/g)].map(match => match[1])

const signFile = (file, privateKeyPem) => {
  writeFileSync(`${file}.sig`, `${signText(readFileSync(file, 'utf8'), privateKeyPem)}\n`)
  return `${file}.sig`
}

const checkFile = (file, publicKeys) => {
  const text = readFileSync(file, 'utf8')
  const signature = readFileSync(`${file}.sig`, 'utf8').trim()
  return publicKeys.some(key => verifyText(text, signature, key))
}

if (require.main === module) {
  const [command, file] = process.argv.slice(2)
  if (command === 'generate') {
    const { privateKey, publicKey } = generateKeys()
    console.log(`${privateKey}\n${publicKey}`)
  } else if (command === 'sign' && file) {
    // a release without the secret is published unsigned: the macOS apps find no signature and do not update
    if (!process.env.UPDATE_SIGNING_KEY) console.log(`::warning::UPDATE_SIGNING_KEY is not set, ${file} is not signed and macOS apps will not update`)
    else console.log(`signed ${signFile(file, process.env.UPDATE_SIGNING_KEY)}`)
  } else if (command === 'check' && file) {
    if (!checkFile(file, readPublicKeys())) throw new Error(`${file}.sig is not a signature of ${file} by a key of shared/constants/update-keys.ts`)
    console.log(`${file}.sig is valid`)
  } else {
    throw new Error('usage: node scripts/release/update-signature.js sign|check <file> | generate')
  }
}

module.exports = { checkFile, generateKeys, readPublicKeys, signFile, signText, verifyText }
