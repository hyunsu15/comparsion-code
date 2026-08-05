package com.koscom.acct.online;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.koscom.acct.mapper.AcctMapper;
import com.koscom.acct.model.AcctHis;
import com.koscom.acct.model.AcctMst;
import com.koscom.acct.model.AcctOpenRequest;
import com.koscom.acct.model.AcctOpenResponse;
import com.koscom.acct.model.CustInfo;
import com.koscom.common.exception.BizException;

/**
 * ACCT001 : 계좌 신규 등록 온라인 거래 (PB 이관)
 *
 * <p>고객 정보를 확인한 뒤 신규 계좌를 채번하여 계좌원장에 등록한다.
 * 등록 후 거래내역(TB_ACCT_HIS)에 개설 이력을 남긴다.</p>
 */
@Service
public class AcctService {

    private final AcctMapper acctMapper;

    public AcctService(AcctMapper acctMapper) {
        this.acctMapper = acctMapper;
    }

    /**
     * 계좌 개설 메인 처리. PB 의 acct001_main 과 1:1 대응된다.
     */
    @Transactional
    public AcctOpenResponse openAccount(AcctOpenRequest req) {

        CustInfo cust = selectCustInfo(req.getCustId());
        if (cust == null) {
            throw new BizException("E0101", "고객정보가 존재하지 않습니다.");
        }

        String acctSeq = selectNextAcctSeq(req.getProdCd());
        String acctNo = req.getOpenBr() + req.getProdCd() + acctSeq;
        req.setAcctNo(acctNo);

        insertAcctMst(req);
        insertAcctHis(req);
        updateCustAcctCnt(req.getCustId());

        AcctOpenResponse res = new AcctOpenResponse();
        res.setAcctNo(acctNo);
        res.setCustNm(cust.getCustNm());
        return res;
    }

    /**
     * 고객 기본정보 조회 — PB select_cust_info
     */
    public CustInfo selectCustInfo(String custId) {
        return acctMapper.selectCustInfo(custId);
    }

    /**
     * 상품별 계좌 일련번호 채번 — PB select_next_acct_seq
     */
    public String selectNextAcctSeq(String prodCd) {
        String seq = acctMapper.selectNextAcctSeq(prodCd);
        if (seq == null) {
            throw new BizException("E0102", "계좌번호 채번에 실패했습니다.");
        }
        return seq;
    }

    /**
     * 계좌원장 등록 — PB insert_acct_mst
     */
    public void insertAcctMst(AcctOpenRequest req) {
        AcctMst mst = new AcctMst();
        mst.setAcctNo(req.getAcctNo());
        mst.setCustId(req.getCustId());
        mst.setProdCd(req.getProdCd());
        mst.setOpenBr(req.getOpenBr());
        mst.setOpenAmt(req.getOpenAmt() == null ? BigDecimal.ZERO : req.getOpenAmt());
        mst.setAcctStat("1");
        mst.setRegId(req.getRegId());
        mst.setRegDtm(LocalDateTime.now());

        int cnt = acctMapper.insertAcctMst(mst);
        if (cnt != 1) {
            throw new BizException("E0103", "계좌원장 등록에 실패했습니다.");
        }
    }

    /**
     * 계좌 개설 이력 등록 — PB insert_acct_his
     */
    public void insertAcctHis(AcctOpenRequest req) {
        AcctHis his = new AcctHis();
        his.setAcctNo(req.getAcctNo());
        his.setTranCd("0100");
        his.setTranAmt(req.getOpenAmt());
        his.setRegId(req.getRegId());

        int cnt = acctMapper.insertAcctHis(his);
        if (cnt != 1) {
            throw new BizException("E0104", "거래이력 등록에 실패했습니다.");
        }
    }

    /**
     * 고객 보유 계좌수 갱신 — PB update_cust_acct_cnt
     */
    public void updateCustAcctCnt(String custId) {
        int cnt = acctMapper.updateCustAcctCnt(custId);
        if (cnt != 1) {
            throw new BizException("E0105", "고객 계좌수 갱신에 실패했습니다.");
        }
    }
}
