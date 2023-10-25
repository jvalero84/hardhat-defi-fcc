const { ethers, getNamedAccounts, network } = require("hardhat")
const { networkConfig } = require("../helper-hardhat-config")

const AMOUNT = ethers.parseEther("0.02")

async function getWeth() {
  const { deployer } = await getNamedAccounts()
  // Call the "deposit" function on the weth token contract
  // address of WETH token on mainnet (because we will be forking mainnet): 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
  const signer = await ethers.getSigner(deployer)
  const iWeth = await ethers.getContractAt(
    "IWeth",
    networkConfig[network.config.chainId].wethToken,
    signer,
  )
  const tx = await iWeth.deposit({ value: AMOUNT })
  await tx.wait(1)
  const wethBalance = await iWeth.balanceOf(deployer)
  console.log(`Got ${wethBalance.toString()} WETH`)
}

module.exports = { getWeth, AMOUNT }
