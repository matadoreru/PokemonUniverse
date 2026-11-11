/**
 * Kit de los juegos de subasta (Arcade DS F8): Pokémon Team Auction y Pokémon Bluff Auction comparten el marco, el lote
 * con la puja actual y la adjudicación, los controles de la puja (incrementos con atajos, campo y «Pasar»), los
 * presupuestos y el historial.
 */
export { AuctionScreen } from './AuctionScreen';
export type { AuctionScreenProps, AuctionTimer } from './AuctionScreen';
export { AuctionAward, AuctionLot, AuctionPrevious } from './AuctionLot';
export type { AuctionAwardProps, AuctionLeader, AuctionLotProps, AuctionPreviousProps } from './AuctionLot';
export { BidControls } from './BidControls';
export type { BidControlsProps, PassConfirm } from './BidControls';
export { BudgetPlate } from './BudgetPlate';
export type { BudgetEntry, BudgetPlateProps } from './BudgetPlate';
export { BidHistory, BidHistoryList } from './BidHistory';
export type { BidHistoryProps, BidHistoryView } from './BidHistory';
export { amountText, bidBlock, bidEpoch, bidLog, turnOrderEntries, waitTexts } from './presentation';
export type { BidBlockInput, BidBlockReason, BidEventLike, BidLogEntry, TurnOrderEntry } from './presentation';
