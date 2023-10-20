const { getWeth } = require("../scripts/getWeth")
const { getNamedAccounts } = require("hardhat")

async function main() {
  // the AAVE protocol treats everything as an ERC20 token.
  // WETH is basically ETH wrapped in an ERC20 token contract.
  await getWeth()
  const { deployer } = await getNamedAccounts()
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
