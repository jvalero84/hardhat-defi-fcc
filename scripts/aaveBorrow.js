const { getWeth, AMOUNT } = require("../scripts/getWeth")
const { getNamedAccounts, network } = require("hardhat")
const { networkConfig } = require("../helper-hardhat-config")

async function main() {
  // the AAVE protocol treats everything as an ERC20 token.
  // WETH is basically ETH wrapped in an ERC20 token contract.

  await getWeth()
  const { deployer } = await getNamedAccounts()

  // Pool
  const lendingPool = await getLendingPool(deployer)
  console.log(`LendingPool address ${lendingPool.target}`)

  // Before depositing WETH, since the deposit function uses safeTransferFrom (SupplyLogic),
  // it means the contract will pull the funds from our wallet, so we have to approve the contract to do so first
  const wethTokenAddress = networkConfig[network.config.chainId].wethToken
  await approveErc20(wethTokenAddress, lendingPool.target, AMOUNT, deployer)
  console.log("Depositing...")
  await lendingPool.deposit(wethTokenAddress, AMOUNT, deployer, 0)
  console.log("Deposited!")

  // Before we borrow, it would be nice to know about our possition: how much have we borrowed,
  // how much we have in collateral, how much we can borrow...
  let { availableBorrowsBase, totalDebtBase } = await getBorrowUserData(
    lendingPool,
    deployer,
  )

  // It seems that in aave V3 the getUserAccountData returns the info in USD instead of ETH
  // So we don't need to get the DAI-ETH price conversion from ChainLink data feeds...
  const daiPrice = await getDaiPrice()
  const amountDaiToBorrowETH = (Number(availableBorrowsBase) / daiPrice) * 0.95
  // console.log(`amountDaiToBorrowETH: ${amountDaiToBorrowETH}`)
  // console.log(`You can borrow ${amountDaiToBorrowETH.toString()} DAI`)

  // Since all the user account info is in USD, we can just operate with that data and DAI.
  const amountDaiToBorrow =
    Number(ethers.formatUnits(availableBorrowsBase, 8)) * 0.95
  const amountDaiToBorrowWei = ethers.parseEther(amountDaiToBorrow.toString())
  console.log(`Actual DAI to borrow: ${amountDaiToBorrow}`)
  console.log(`You can borrow ${amountDaiToBorrowWei} DAI (in wei)`)

  // Time to borrow!
  await borrowDai(
    networkConfig[network.config.chainId].daiToken,
    lendingPool,
    amountDaiToBorrowWei,
    deployer,
  )
  await getBorrowUserData(lendingPool, deployer)

  // Lets repay our borrowed DAI
  await repay(
    amountDaiToBorrowWei,
    networkConfig[network.config.chainId].daiToken,
    lendingPool,
    deployer,
  )
  await getBorrowUserData(lendingPool, deployer)
  // We can see that even after repaying our borrowed DAI, we still have some DAI borrowed left, that is because of the yield interest generated.
}

async function repay(amount, daiAddress, lendingPool, account) {
  await approveErc20(daiAddress, lendingPool.target, amount, account)
  const repayTx = await lendingPool.repay(daiAddress, amount, 2, account)
  await repayTx.wait(1)
  console.log("You've repaid!")
}

async function borrowDai(
  daiAddress,
  lendingPool,
  amountDaiToBorrowWei,
  account,
) {
  const borrowTx = await lendingPool.borrow(
    daiAddress,
    amountDaiToBorrowWei,
    2, // Stable does not seem to work on aave V3 for our setup: stable rate borrowing is not enabled (ReserveConfigurationMap@DataTypes.sol)
    0,
    account,
  )
  await borrowTx.wait(1)
  console.log("You've borrowed!")
}

async function getDaiPrice() {
  const daiEthPriceFeed = await ethers.getContractAt(
    "AggregatorV3Interface",
    networkConfig[network.config.chainId].daiEthPriceFeed,
  )
  const price = ethers.formatEther((await daiEthPriceFeed.latestRoundData())[1])
  console.log(`The DAI/ETH price is ${price}`)
  const ethPriceInDai = Number(ethers.parseEther("1")) / Number(price)
  console.log(`The ETH/DAI price is ${ethPriceInDai.toPrecision(5)}`)
  return ethPriceInDai
}

async function getBorrowUserData(lendingPool, account) {
  const { totalCollateralBase, totalDebtBase, availableBorrowsBase } =
    await lendingPool.getUserAccountData(account)
  console.log(
    `You have ${ethers.formatUnits(
      totalCollateralBase,
      8,
    )} worth of USD deposited.`,
  )
  console.log(
    `You have ${ethers.formatUnits(totalDebtBase, 8)} worth of USD borrowed.`,
  )
  console.log(
    `You can borrow ${ethers.formatUnits(
      availableBorrowsBase,
      8,
    )} worth of USD.`,
  )
  // We don't really need to return totalCollateral info..
  return { availableBorrowsBase, totalDebtBase }
}

async function approveErc20(
  erc20Address,
  spenderAddress,
  amountToSpend,
  account,
) {
  const signer = await ethers.getSigner(account)
  const erc20Token = await ethers.getContractAt("IERC20", erc20Address, signer)
  const tx = await erc20Token.approve(spenderAddress, amountToSpend)
  await tx.wait(1)
  console.log("Approved!")
}

async function getLendingPool(account) {
  const signer = await ethers.getSigner(account)
  const lendingPoolAddressesProvider = await ethers.getContractAt(
    "IPoolAddressesProvider",
    networkConfig[network.config.chainId].lendingPoolAddressesProvider,
    signer,
  )
  const lendingPoolAddress = await lendingPoolAddressesProvider.getPool()
  const lendingPool = await ethers.getContractAt(
    "IPool",
    lendingPoolAddress,
    signer,
  )
  return lendingPool
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
