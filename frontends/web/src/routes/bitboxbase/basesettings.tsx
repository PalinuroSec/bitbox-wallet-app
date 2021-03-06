/**
 * Copyright 2019 Shift Devices AG
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Component, h, RenderableProps } from 'preact';
import loadingStatic from '../../assets/icons/loading-static.png';
import { alertUser } from '../../components/alert/Alert';
import { ChangeBaseHostname } from '../../components/bitboxbase/changebasehostname';
import { ChangeBasePassword } from '../../components/bitboxbase/changebasepassword';
import { CreateBaseBackup } from '../../components/bitboxbase/createbasebackup';
import { EnableSSHLogin } from '../../components/bitboxbase/enablesshlogin';
import { SetBaseSystemPassword } from '../../components/bitboxbase/setbasesystempassword';
import { UpdateBaseButton } from '../../components/bitboxbase/updatebasebutton';
import { CenteredContent } from '../../components/centeredcontent/centeredcontent';
import { confirmation } from '../../components/confirm/Confirm';
import { CopyableInput } from '../../components/copy/Copy';
import { Dialog } from '../../components/dialog/dialog';
import { Button } from '../../components/forms';
import { Header } from '../../components/layout/header';
import { QRCode } from '../../components/qrcode/qrcode';
import { SettingsButton } from '../../components/settingsButton/settingsButton';
import { SettingsItem } from '../../components/settingsButton/settingsItem';
import * as spinnerStyle from '../../components/spinner/Spinner.css';
import { TruncateMiddle } from '../../components/truncateMiddle/truncateMiddle';
import WaitDialog from '../../components/wait-dialog/wait-dialog';
import { translate, TranslateProps } from '../../decorators/translate';
import { apiSubscribe } from '../../utils/event';
import { apiGet, apiPost } from '../../utils/request';
import SimpleMarkup from '../../utils/simplemarkup';
import { verificationProgress } from '../../utils/verificationprogress';
import { BaseUpdateInfo, BitBoxBaseInfo, BitBoxBaseServiceInfo, statusBadgeColor } from './bitboxbase';
import * as style from './bitboxbase.css';

interface SettingsProps {
    baseID: string;
    baseInfo: BitBoxBaseInfo;
    serviceInfo?: BitBoxBaseServiceInfo;
    disconnect: () => void;
    connectElectrum: () => void;
    getBaseInfo: () => void;
    apiPrefix: string;
    updateAvailable?: boolean;
    updateInfo?: BaseUpdateInfo;
    baseUserStatus?: string;
}

enum UpdateState {
    updateNotInProgress = 1,
    updateDownloading,
    updateFailed,
    updateApplying,
    updateRebooting,
}

interface State {
    expandedDashboard: boolean;
    expandedTorAddress: boolean;
    updating?: boolean;
    updateProgress: {
        updateState: UpdateState,
        updatePercentage: number,
        updateKBDownloaded: number,
    };
    waitDialog?: {
        title?: string;
        text?: string;
    };
}

type Props = SettingsProps & TranslateProps;

class BaseSettings extends Component<Props, State> {
    constructor(props) {
        super(props);
        this.state = {
            expandedDashboard: false,
            expandedTorAddress: false,
            updating: undefined,
            updateProgress: {
                updateState: UpdateState.updateNotInProgress,
                updatePercentage: 0,
                updateKBDownloaded: 0,
            },
            waitDialog: undefined,
        };
    }

    private unsubscribe!: () => void;

    public componentDidMount() {
        this.unsubscribe = apiSubscribe('/' + this.props.apiPrefix + '/event', ({ object }) => {
            switch (object) {
                case 'baseUpdateProgressChanged':
                    this.onbaseUpdateProgressChanged();
                    break;
            }
        });
    }

    private onbaseUpdateProgressChanged = () => {
        apiGet(this.props.apiPrefix + '/base-update-progress')
        .then(response => {
            if (response.success) {
                // If we get a notification that the update has failed, don't reset state to updating
                if (!this.state.updating && response.updateProgress.updateState !== UpdateState.updateFailed) {
                    this.setState({ updating: true });
                }
                this.setState({ updateProgress: response.updateProgress });
            } else {
                alertUser(response.message);
            }
        });
    }

    private restart = () => {
        apiPost(this.props.apiPrefix + '/reboot-base')
                .then(response => {
                    if (!response.success) {
                        alertUser(response.message);
                    }
                });
            }

    private shutdown = () => {
        apiPost(this.props.apiPrefix + '/shutdown-base')
                .then(response => {
                    if (!response.success) {
                        alertUser(response.message);
                    }
                });
            }

    private updateBase = (version: string) => {
        this.setState({ updating: true });
        apiPost(this.props.apiPrefix + '/update-base', { version })
        .then(response => {
            if (!response.success) {
                this.setState({ updating: false });
                alertUser(response.message);
            }
        });
    }

    private toggleTor = (enableTor: boolean) => {
        const { t, baseInfo } = this.props;
        confirmation(t(`bitboxBase.settings.node.confirmTorEnabled.${baseInfo.isTorEnabled}`), confirmed => {
            if (confirmed) {
                this.setState({ waitDialog: {
                    title: this.props.t('generic.applying'),
                    text: this.props.t('bitboxBase.settings.node.bitcoinRestarting'),
                } });
                apiPost(this.props.apiPrefix + '/enable-tor', enableTor)
                .then(response => {
                    if (response.success) {
                        this.props.getBaseInfo();
                        this.setState({ waitDialog: undefined, expandedTorAddress: false });
                    } else {
                        alertUser(response.message);
                    }
                });
            }
        });
    }

    public toggleExpandedTorAddress = () => {
        this.setState({ expandedTorAddress: !this.state.expandedTorAddress });
    }

    public componentWillUnmount() {
        this.unsubscribe();
    }

    public render(
        {
            t,
            serviceInfo,
            baseInfo,
            disconnect,
            connectElectrum,
            updateInfo,
            updateAvailable,
            apiPrefix,
            getBaseInfo,
            baseUserStatus,
            baseID,
        }: RenderableProps<Props>,
        {
            expandedDashboard,
            expandedTorAddress,
            updating,
            updateProgress,
            waitDialog,
        }: State,
    ) {
        return (
            <div className="contentWithGuide">
                <div className="container">
                    <Header title={<SimpleMarkup tagName="h2" markup={t('bitboxBase.settings.title')}/>}/>
                    {
                        waitDialog && (
                            <WaitDialog title={waitDialog.title}>
                                {waitDialog.text}
                            </WaitDialog>
                        )
                    }
                    <div className="innerContainer scrollableContainer">
                        <div className={style.dashboardContainer}>
                            <div className={[style.dashboard, expandedDashboard ? style.expanded : ''].join(' ')}>
                                <div className={style.nameStatus}>
                                        <div className="subHeader">
                                            <h3>{baseInfo.hostname}</h3>
                                        </div>
                                        <div>
                                        <span className="m-left-quarter text-black"><span className={[style.statusBadge, style.large, style[statusBadgeColor(baseID)]].join(' ')}>
                                            </span>{baseUserStatus ? baseUserStatus : t('bitboxBase.settings.dashboard.notAvailable')}</span>
                                        </div>
                                </div>
                                <div className={style.items}>
                                    <div className={style.item}>
                                        <div className={style.dashboardItem}>
                                            {
                                                serviceInfo ?
                                                <p>{verificationProgress(serviceInfo.bitcoindVerificationProgress)}%</p>
                                                :
                                                <div className={style.loadingIconContainer}>
                                                    <img src={loadingStatic} style="width: 24px"/>
                                                </div>
                                            }
                                            <p>{t('bitboxBase.settings.dashboard.syncStatus')}</p>
                                        </div>
                                    </div>
                                    <div className={style.item}>
                                        <div className={style.dashboardItem}>
                                            {
                                                serviceInfo ?
                                                <p>{serviceInfo.bitcoindPeers}</p>
                                                :
                                                <div className={style.loadingIconContainer}>
                                                    <img src={loadingStatic} style="width: 24px"/>
                                                </div>
                                            }
                                            <p>{t('bitboxBase.settings.dashboard.peers')}</p>
                                        </div>
                                    </div>
                                    <div className={style.item}>
                                        <div className={style.dashboardItem}>
                                            {
                                                serviceInfo ?
                                                <p>{serviceInfo.lightningActiveChannels}</p>
                                                :
                                                <div className={style.loadingIconContainer}>
                                                    <img src={loadingStatic} style="width: 24px"/>
                                                </div>
                                            }
                                            <p>{t('bitboxBase.settings.dashboard.lightningChannels')}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className={style.expandedItemsContainer}>
                                    <div className="columnsContainer">
                                        <div className="columns">
                                            <div className="column column-1-3">
                                                <div className="subHeaderContainer">
                                                    <div className="subHeader">
                                                        <h3>{t('bitboxBase.settings.advanced.subheaders.networking')}</h3>
                                                    </div>
                                                </div>
                                                <div className="box slim divide">
                                                    <div className={style.expandedItem}>
                                                        <div>
                                                            <span className="label">{t('bitboxBase.settings.advanced.ipAddress')}</span>
                                                            <p>{baseInfo.middlewareLocalIP}</p>
                                                        </div>
                                                        <div>
                                                            <span className="label">{t('bitboxBase.settings.advanced.port')}</span>
                                                            <p>{baseInfo.middlewarePort}</p>
                                                        </div>
                                                    </div>
                                                    <div className={style.expandedItem}>
                                                        <div style="text-align: left;">
                                                            <span className="label">{t('bitboxBase.settings.advanced.torAddress')}</span>
                                                            <p>
                                                                <a onClick={baseInfo.isTorEnabled ? this.toggleExpandedTorAddress :
                                                                    () => this.toggleTor(true)}>
                                                                    <TruncateMiddle text={baseInfo.middlewareTorOnion} />
                                                                </a>
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="column column-1-3">
                                                <div className="subHeaderContainer">
                                                    <div className="subHeader">
                                                        <h3>{t('bitboxBase.settings.advanced.subheaders.bitcoin')}</h3>
                                                    </div>
                                                </div>
                                                <div className="box slim divide">
                                                    <div className={[style.expandedItem, style.equal].join(' ')}>
                                                        <div>
                                                            <span className="label">{t('bitboxBase.settings.advanced.status')}</span>
                                                            <p><span className={[style.statusBadge, style.online].join(' ')}></span>{baseInfo.isBitcoindListening ? 'Listening' : 'Offline'}</p>
                                                        </div>
                                                        <div>
                                                            <span className="label">{t('bitboxBase.settings.advanced.version')}</span>
                                                            <p>{baseInfo.bitcoindVersion}</p>
                                                        </div>
                                                    </div>
                                                    <div className={[style.expandedItem, style.equal].join(' ')}>
                                                        <div>
                                                            <span className="label">{t('bitboxBase.settings.advanced.blocks')}</span>
                                                            {
                                                                serviceInfo ?
                                                                <p>{serviceInfo.bitcoindBlocks.toString()}</p>
                                                                :
                                                                <p className={style.loadingText}>{t('loading')}</p>
                                                            }
                                                        </div>
                                                        <div>
                                                            <span className="label">{t('bitboxBase.settings.advanced.headers')}</span>
                                                            {
                                                                serviceInfo ?
                                                                <p>{serviceInfo.bitcoindHeaders.toString()}</p>
                                                                :
                                                                <p className={style.loadingText}>{t('loading')}</p>
                                                            }
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="column column-1-3">
                                                <div className="subHeaderContainer">
                                                    <div className="subHeader">
                                                        <h3>{t('bitboxBase.settings.advanced.subheaders.lightning')} {t('generic.and')} {t('bitboxBase.settings.advanced.subheaders.electrs')}</h3>
                                                    </div>
                                                </div>
                                                <div className="box slim divide">
                                                    <div className={[style.expandedItem, style.equal].join(' ')}>
                                                        <div>
                                                            <span className="label">{t('bitboxBase.settings.advanced.subheaders.lightning')} {t('bitboxBase.settings.advanced.version').toLowerCase()}</span>
                                                            <p>{baseInfo.lightningdVersion}</p>
                                                        </div>
                                                        <div>
                                                            <span className="label">
                                                                {t('bitboxBase.settings.advanced.subheaders.lightning')} {t('bitboxBase.settings.advanced.blocks').toLowerCase()}
                                                            </span>
                                                            {
                                                                serviceInfo ?
                                                                <p>{serviceInfo.lightningdBlocks.toString()}</p>
                                                                :
                                                                <p className={style.loadingText}>{t('loading')}</p>
                                                            }
                                                        </div>
                                                    </div>
                                                    <div className={[style.expandedItem, style.equal].join(' ')}>
                                                        <div>
                                                            <span className="label">{t('bitboxBase.settings.advanced.subheaders.electrs')} {t('bitboxBase.settings.advanced.version').toLowerCase()}</span>
                                                            <p>{baseInfo.electrsVersion}</p>
                                                        </div>
                                                        <div>
                                                            <span className="label">
                                                                {t('bitboxBase.settings.advanced.subheaders.electrs')} {t('bitboxBase.settings.advanced.blocks').toLowerCase()}
                                                            </span>
                                                            {
                                                                serviceInfo ?
                                                                <p>{serviceInfo.electrsBlocks.toString()}</p>
                                                                :
                                                                <p className={style.loadingText}>{t('loading')}</p>
                                                            }
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <hr style="margin: 0px;"/>
                            <button className={style.expandButton} onClick={() => this.setState({ expandedDashboard: !expandedDashboard })}>
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeLinecap="round"
                                    strokeLinejoin="round">
                                    {
                                        expandedDashboard ? (
                                            <polyline points="18 15 12 9 6 15"></polyline>
                                        ) : (
                                            <polyline points="6 11 12 17 18 11"></polyline>
                                        )
                                    }
                                </svg>
                            </button>
                        </div>
                        {
                            updating ?
                            <div className={style.updateStatus}>
                                <CenteredContent>
                                    <div className="flex flex-column flex-items-center">
                                        <div className="subHeader">
                                            <div className={style.spinnerContainer}>
                                                <div className={[spinnerStyle.spinner, style.spinnerSize].join(' ')}>
                                                    <div></div>
                                                    <div></div>
                                                    <div></div>
                                                    <div></div>
                                                </div>
                                                <p className={spinnerStyle.spinnerText}>{t(`bitboxBase.settings.system.updateProgress.${UpdateState[updateProgress.updateState]}`)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-column flex-center">
                                        <progress value={updateProgress.updatePercentage} max="100">
                                            {updateProgress.updatePercentage}
                                        </progress>
                                        <div>
                                            <p className="text-small text-gray m-top-quarter" style="max-width: 360px">{t('bitboxBase.settings.system.updateProgress.warning')}</p>
                                        </div>
                                    </div>
                                </CenteredContent>
                            </div>
                            :
                            <div className="content padded">
                                <div className="columnsContainer m-top-half">
                                    <div className="columns">
                                        <div className="column column-1-3">
                                            <div class="subHeaderContainer">
                                                <div class="subHeader">
                                                    <h3>{t('bitboxBase.settings.node.title')}</h3>
                                                </div>
                                            </div>
                                            <div className="box slim divide">
                                            <ChangeBaseHostname
                                                apiPrefix={apiPrefix}
                                                currentHostname={baseInfo.hostname}
                                                getBaseInfo={getBaseInfo} />
                                            <ChangeBasePassword apiPrefix={apiPrefix} />
                                            <SettingsButton
                                                optionalText={t('generic.enabled', { context: baseInfo.isTorEnabled.toString() })}
                                                onClick={baseInfo.isTorEnabled ?
                                                    this.toggleExpandedTorAddress :
                                                    () => this.toggleTor(true)}>
                                                {t('bitboxBase.settings.node.tor')}
                                            </SettingsButton>
                                            <SettingsButton danger onClick={() => {
                                                    confirmation(t('bitboxBase.settings.node.confirmDisconnect'), confirmed => {
                                                        if (confirmed) {
                                                            disconnect();
                                                        }
                                                    });
                                                }}>{t('bitboxBase.settings.node.disconnect')}</SettingsButton>
                                        </div>
                                        </div>
                                        <div className="column column-1-3">
                                            <div class="subHeaderContainer">
                                                <div class="subHeader">
                                                    <h3>{t('bitboxBase.settings.system.title')}</h3>
                                                </div>
                                            </div>
                                            <div className="box slim divide">
                                                {
                                                    updateAvailable && updateInfo ?
                                                    (
                                                        <UpdateBaseButton
                                                            apiPrefix={apiPrefix}
                                                            updateInfo={updateInfo}
                                                            currentVersion={baseInfo.baseVersion}
                                                            updateBase={this.updateBase} />
                                                    ) :
                                                    <SettingsItem optionalText={baseInfo.baseVersion}>
                                                        {t('bitboxBase.settings.system.upToDate')}
                                                    </SettingsItem>
                                                }
                                                <SettingsButton onClick={() => {
                                                    confirmation(t('bitboxBase.settings.system.confirmRestart'), confirmed => {
                                                        if (confirmed) {
                                                            this.restart();
                                                        }
                                                    });
                                                }}>{t('bitboxBase.settings.system.restart')}</SettingsButton>
                                                <SettingsButton onClick={() => {
                                                    confirmation(t('bitboxBase.settings.system.confirmShutdown'), confirmed => {
                                                        if (confirmed) {
                                                            this.shutdown();
                                                        }
                                                    });
                                                }}>{t('bitboxBase.settings.system.shutdown')}</SettingsButton>
                                            </div>
                                        </div>
                                        <div className="column column-1-3">
                                            <div class="subHeaderContainer">
                                                <div class="subHeader">
                                                    <h3>{t('bitboxBase.settings.backups.title')}</h3>
                                                </div>
                                            </div>
                                            <div className="box slim divide">
                                                <CreateBaseBackup apiPrefix={apiPrefix} />
                                                <SettingsButton disabled={true}>{t('bitboxBase.settings.backups.restore')}</SettingsButton>
                                            </div>
                                        </div>
                                    </div>
                                    <hr/>
                                    <div className="content p-none">
                                        <div className="columns">
                                            <div className="column column-1-3">
                                                <details>
                                                    <summary className={style.summary}>
                                                        {t('bitboxBase.settings.advanced.title')}
                                                    </summary>
                                                    <div className="box slim divide">
                                                        <EnableSSHLogin
                                                            apiPrefix={apiPrefix}
                                                            enabled={baseInfo.isSSHPasswordLoginEnabled}
                                                            onSuccess={getBaseInfo} />
                                                        <SetBaseSystemPassword apiPrefix={apiPrefix} />
                                                        <SettingsButton disabled={true} onClick={connectElectrum}>{t('bitboxBase.settings.advanced.connectElectrum')}</SettingsButton>
                                                        <SettingsButton disabled={true}>{t('bitboxBase.settings.advanced.syncOptions')}</SettingsButton>
                                                        <SettingsButton disabled={true}>{t('bitboxBase.settings.advanced.manual')}</SettingsButton>
                                                        <SettingsButton disabled={true} danger>{t('bitboxBase.settings.advanced.reset')}</SettingsButton>
                                                    </div>

                                                </details>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        }
                    </div>
                </div>
                {
                    expandedTorAddress && (
                        <Dialog
                            title={t('bitboxBase.settings.node.tor') + ': ' + t('generic.enabled', { context: baseInfo.isTorEnabled.toString() }).toLowerCase()}
                            onClose={this.toggleExpandedTorAddress}>
                            {
                                baseInfo.isTorEnabled && (
                                    <div className="p-bottom-half">
                                        <div className="flex flex-row flex-center">
                                            <QRCode data={baseInfo.middlewareTorOnion} />
                                        </div>
                                        <CopyableInput value={baseInfo.middlewareTorOnion} flexibleHeight />
                                    </div>
                                )
                            }
                            <div className="buttons text-center">
                                <Button
                                    danger
                                    style="width: 100%;"
                                    onClick={() => this.toggleTor(false)}>
                                    {t('generic.enable', { context: 'false' })}
                                </Button>
                            </div>
                        </Dialog>
                    )
                }
            </div>
        );
    }
}

const TranslatedBaseSettings = translate<SettingsProps>()(BaseSettings);
export { TranslatedBaseSettings as BaseSettings };
