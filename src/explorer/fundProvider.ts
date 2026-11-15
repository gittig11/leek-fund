import {
  DataTransfer,
  DataTransferItem,
  Event,
  EventEmitter,
  TreeDataProvider,
  TreeDragAndDropController,
  TreeItem,
  TreeItemCollapsibleState,
} from 'vscode';
import globalState from '../globalState';
import { LeekFundConfig } from '../shared/leekConfig';
import { LeekTreeItem } from '../shared/leekTreeItem';
import { defaultFundInfo, SortType } from '../shared/typed';
import FundService from './fundService';

export class FundProvider
  implements TreeDataProvider<LeekTreeItem>, TreeDragAndDropController<LeekTreeItem> {
  static readonly GROUP_MIME_TYPE = 'application/vnd.code.tree.leekfundview.fund.groups';

  readonly dragMimeTypes: string[] = [FundProvider.GROUP_MIME_TYPE];
  readonly dropMimeTypes: string[] = [FundProvider.GROUP_MIME_TYPE];

  private _onDidChangeTreeData: EventEmitter<any> = new EventEmitter<any>();

  readonly onDidChangeTreeData: Event<any> = this._onDidChangeTreeData.event;

  private service: FundService;
  private order: SortType;

  constructor(service: FundService) {
    this.service = service;
    this.order = LeekFundConfig.getConfig('leek-fund.fundSort') || SortType.NORMAL;
  }

  refresh(): any {
    this._onDidChangeTreeData.fire(undefined);
  }

  handleDrag(source: LeekTreeItem[], dataTransfer: DataTransfer): void {
    const groupNodes = source.filter((item) => item?.isCategory);
    if (!groupNodes.length) {
      return;
    }
    dataTransfer.set(FundProvider.GROUP_MIME_TYPE, new DataTransferItem(groupNodes));
  }

  handleDrop(target: LeekTreeItem | undefined, dataTransfer: DataTransfer): void {
    const transferItem = dataTransfer.get(FundProvider.GROUP_MIME_TYPE);
    if (!transferItem) {
      return;
    }
    const groupNodes = (transferItem.value || []) as Array<LeekTreeItem>;
    const sourceNode = groupNodes.find((item) => item?.isCategory);
    if (!sourceNode) {
      return;
    }
    const fromIndex = parseInt((sourceNode.id || '').replace('fundGroup_', ''));
    if (isNaN(fromIndex) || fromIndex < 0 || fromIndex >= globalState.fundGroups.length) {
      return;
    }
    let insertIndex = globalState.fundGroups.length - 1;
    if (target) {
      if (!target.isCategory) {
        return;
      }
      const targetIndex = parseInt((target.id || '').replace('fundGroup_', ''));
      if (isNaN(targetIndex)) {
        return;
      }
      insertIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
    }
    if (insertIndex === fromIndex) {
      return;
    }
    const [group] = globalState.fundGroups.splice(fromIndex, 1);
    const [fundCodes] = globalState.fundLists.splice(fromIndex, 1);
    globalState.fundGroups.splice(insertIndex, 0, group);
    globalState.fundLists.splice(insertIndex, 0, fundCodes);
    LeekFundConfig.setConfig('leek-fund.fundGroups', globalState.fundGroups);
    LeekFundConfig.setConfig('leek-fund.funds', globalState.fundLists);
    this.refresh();
  }

  getChildren(element?: LeekTreeItem | undefined): LeekTreeItem[] | Thenable<LeekTreeItem[]> {
    if (!element) {
      return this.getRootNodes(globalState.fundGroups, globalState.fundLists);
    } else {
      return this.getChildrenNodes(element, globalState.fundLists);
    }
  }

  getRootNodes(fundGroups: Array<string>, fundLists: Array<Array<string>>): Array<LeekTreeItem> {
    let nodes: Array<LeekTreeItem> = [];
    fundLists.forEach((value, index) => {
      nodes.push(
        new LeekTreeItem(
          Object.assign({ contextValue: 'category' }, defaultFundInfo, {
            id: `fundGroup_${index}`,
            name: `${fundGroups[index]}${value.length > 0 ? `(${value.length})` : ''}`,
          }),
          undefined,
          true
        )
      );
    });
    return nodes;
  }

  getChildrenNodes(element: LeekTreeItem, fundLists: Array<Array<string>>): Promise<Array<LeekTreeItem>> {
    const groupId = element.id || '';
    const index: number = parseInt(groupId.replace('fundGroup_', ''));
    const fundCodes: Array<string> = fundLists[index];
    return this.service.getData(fundCodes, this.order, groupId);
  }

  getParent(): LeekTreeItem | null {
    return null;
  }

  getTreeItem(element: LeekTreeItem): TreeItem {
    if (!element.isCategory) {
      return element;
    } else {
      return {
        id: element.id,
        label: element.info.name,
        // tooltip: this.getSubCategoryTooltip(element),
        collapsibleState: TreeItemCollapsibleState.Expanded,
        // iconPath: this.parseIconPathFromProblemState(element),
        command: undefined,
        contextValue: element.contextValue,
      };
    }
  }

  changeOrder(): void {
    let order = this.order as number;

    /* fix: 如果基金排序先前是按照持仓金额升序/降序, 按涨跌排序失效的问题 */
    if (Math.abs(order) > 1) {
      this.order = SortType.NORMAL;
    }

    order += 1;
    if (order > 1) {
      this.order = SortType.DESC;
    } else if (order === 1) {
      this.order = SortType.ASC;
    } else if (order === 0) {
      this.order = SortType.NORMAL;
    }
    LeekFundConfig.setConfig('leek-fund.fundSort', this.order);
    this.refresh();
  }

  changeAmountOrder(): void {
    let order = this.order as number;

    if (order === SortType.AMOUNTDESC) {
      this.order = SortType.AMOUNTASC;
    } else if (order === SortType.AMOUNTASC) {
      this.order = SortType.AMOUNTDESC;
    } else {
      this.order = SortType.AMOUNTDESC;
    }
    LeekFundConfig.setConfig('leek-fund.fundSort', this.order);
    this.refresh();
  }
}