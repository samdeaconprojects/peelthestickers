import React, { useEffect, useMemo, useState } from "react";
import "../Detail/Detail.css";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import { formatTime } from "../TimeList/TimeUtils";
import { currentEventToString } from "../../components/scrambleUtils";
import StatSharePost from "./StatSharePost";
import NameTag from "./NameTag";
import { getUser } from "../../services/getUser";

const getDetailComponent = () => {
  const mod = require("../Detail/Detail");
  return mod?.default || mod;
};

const getAverageDetailComponent = () => {
  const mod = require("../Detail/AverageDetailModal");
  return mod?.default || mod;
};

function PostDetail({
  author,
  authorUser = null,
  date,
  solveList = [],
  note = "",
  postType = "solve",
  statShare = null,
  postColor = "",
  comments = [],
  onClose,
  onDelete,
  onAddComment
}) {
  const [newComment, setNewComment] = useState("");
  const [selectedAverageSolve, setSelectedAverageSolve] = useState(null);
  const [commentProfilesById, setCommentProfilesById] = useState({});
  const trimmedNote = String(note || "").trim();
  const resolvedPostType = statShare ? "stat-share" : postType;
  const isAveragePost = solveList.length > 1;
  const statShareCardKey =
    statShare?.render?.cardKey || statShare?.cardKey || statShare?.kind || "summary";
  const isWideStatShare = ["line", "percent", "bar", "table"].includes(String(statShareCardKey));
  const popupWidthClass =
    resolvedPostType === "stat-share"
      ? isWideStatShare
        ? "postDetailPopupContent--statShareWide"
        : "postDetailPopupContent--statShare"
      : isAveragePost
        ? "postDetailPopupContent--average"
        : "postDetailPopupContent--single";
  const DetailComponent = getDetailComponent();
  const AverageDetailComponent = getAverageDetailComponent();
  const detailSolveList = useMemo(
    () =>
      (Array.isArray(solveList) ? solveList : []).map((solve) => ({
        ...solve,
        __readOnly: true,
      })),
    [solveList]
  );

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let isCancelled = false;

    const commentUserIDs = Array.from(
      new Set(
        (Array.isArray(comments) ? comments : [])
          .map((comment) =>
            String(
              comment?.userID ||
              comment?.UserID ||
              comment?.authorID ||
              comment?.AuthorID ||
              ""
            ).trim()
          )
          .filter(Boolean)
      )
    );

    const missingUserIDs = commentUserIDs.filter((userID) => !commentProfilesById[userID]);
    if (!missingUserIDs.length) return () => {
      isCancelled = true;
    };

    const loadCommentProfiles = async () => {
      const loadedProfiles = await Promise.all(
        missingUserIDs.map(async (userID) => {
          try {
            const profile = await getUser(userID);
            return [userID, profile];
          } catch (error) {
            console.warn("Failed to load comment profile", userID, error);
            return [userID, null];
          }
        })
      );

      if (isCancelled) return;

      setCommentProfilesById((prev) => {
        const next = { ...prev };
        loadedProfiles.forEach(([userID, profile]) => {
          if (profile) next[userID] = profile;
        });
        return next;
      });
    };

    loadCommentProfiles();

    return () => {
      isCancelled = true;
    };
  }, [comments, commentProfilesById]);

  const handleAdd = () => {
    if (!newComment.trim()) return;
    onAddComment(newComment.trim());
    setNewComment("");
  };

  const formatDateTime = (value) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getScrambleFontSize = (event) => {
    switch (event) {
      case "222":
        return "24px";
      case "333":
        return "22px";
      case "444":
        return "18px";
      case "555":
        return "15px";
      case "666":
      case "777":
        return "12px";
      default:
        return "16px";
    }
  };

  const renderFallbackSolveBlock = (solve, index = null) => {
    const eventLabel = currentEventToString(solve?.event || "333");

    return (
      <div
        key={index ?? "single"}
        className={isAveragePost ? "detailSolveCard postDetailSolveCard" : "postDetailSolveSingle"}
      >
        <div className="detailBottomRow postDetailSolveLayout">
          <div className="postDetailMainColumn">
            <div className="detailTimeWrap">
              <div className="detailTime">{formatTime(solve?.time, false, solve?.penalty)}</div>
              <div className="detailMetaLine">
                {eventLabel}
                {isAveragePost && Number.isFinite(index) ? ` · Solve #${index + 1}` : ""}
              </div>
            </div>

            <div className="detailCube postDetailCube">
              <PuzzleSVG event={solve?.event} scramble={solve?.scramble} />
            </div>
          </div>

          <div
            className="detailScramble postDetailScramble"
            style={{ fontSize: getScrambleFontSize(solve?.event) }}
          >
            {solve?.scramble || ""}
          </div>
        </div>
      </div>
    );
  };

  const normalizedComments = comments.map((comment, index) => {
    if (comment && typeof comment === "object") {
      const commentUserID =
        comment.userID ||
        comment.UserID ||
        comment.authorID ||
        comment.AuthorID ||
        "";
      const commentAuthor =
        comment.author ||
        comment.Author ||
        comment.username ||
        comment.Username ||
        comment.name ||
        comment.Name ||
        "Unknown";

      return {
        id: comment.id || comment.createdAt || comment.DateTime || `comment-${index}`,
        author: commentAuthor,
        authorUser: commentProfilesById[commentUserID] || {
          UserID: commentUserID,
          Name: commentAuthor,
          Color: comment.color || comment.Color || "#FFFFFF",
          ProfileEvent: comment.profileEvent || comment.ProfileEvent || "333",
          ProfileScramble: comment.profileScramble || comment.ProfileScramble || "",
        },
        text: comment.text || comment.Text || comment.comment || comment.Comment || "",
        createdAt: comment.createdAt || comment.CreatedAt || comment.DateTime || comment.date || "",
      };
    }

    return {
      id: `comment-${index}`,
      author: "Comment",
      authorUser: {
        Name: "Comment",
        Color: "#FFFFFF",
        ProfileEvent: "333",
        ProfileScramble: "",
      },
      text: String(comment || ""),
      createdAt: "",
    };
  });

  return (
    <div
      className="detailPopup"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`detailPopupContent postDetailPopupContent ${popupWidthClass}`}
        onClick={(event) => event.stopPropagation()}
      >
        {(author || date || trimmedNote) && (
          <div className="postDetailHeader">
            {author ? (
              <NameTag
                user={authorUser || { Name: author }}
                name={author}
                size="sm"
                variant="profile-corner"
              />
            ) : null}
            {date ? <div className="detailDateRow postDetailDate">{formatDateTime(date)}</div> : null}
            {trimmedNote ? <div className="postDetailCaption">{trimmedNote}</div> : null}
          </div>
        )}

        {resolvedPostType === "stat-share" ? (
          <div className="postDetailStatShare">
            <StatSharePost note={trimmedNote} statShare={statShare} shareColor={postColor} />
          </div>
        ) : (
          <div className={`postDetailSolveSection ${isAveragePost ? "postDetailSolveSection--average" : ""}`}>
            {isAveragePost ? (
              typeof AverageDetailComponent === "function" ? (
                <AverageDetailComponent
                  isOpen={true}
                  solves={detailSolveList}
                  onClose={() => {}}
                  onSolveOpen={(solve) =>
                    setSelectedAverageSolve(solve ? { ...solve, __readOnly: true } : null)
                  }
                  embedded={true}
                />
              ) : (
                <div className="detailFlexCol detailScrollList">
                  {detailSolveList.map((solve, index) => renderFallbackSolveBlock(solve, index))}
                </div>
              )
            ) : detailSolveList[0] ? (
              typeof DetailComponent === "function" ? (
                <DetailComponent
                  solve={detailSolveList[0]}
                  onClose={() => {}}
                  embedded={true}
                  showActions={false}
                />
              ) : (
                renderFallbackSolveBlock(detailSolveList[0])
              )
            ) : null}
          </div>
        )}

        <div className="postDetailCommentsSection">
          <h3 className="postDetailCommentsTitle">Comments</h3>
          <div className="postDetailCommentsList">
            {normalizedComments.length === 0 ? (
              <div className="postDetailEmptyComments">No comments yet.</div>
            ) : (
              normalizedComments.map((comment) => (
                <div key={comment.id} className="postDetailComment">
                  <div className="postDetailCommentAuthorRow">
                    <div className="postDetailCommentAuthor">
                      <NameTag
                        user={comment.authorUser}
                        name={comment.author}
                        size="xs"
                        variant="profile-corner"
                      />
                    </div>
                    {comment.createdAt ? (
                      <span className="postDetailCommentDate">
                        {formatDateTime(comment.createdAt)}
                      </span>
                    ) : null}
                  </div>
                  <div className="postDetailCommentBody">{comment.text}</div>
                </div>
              ))
            )}
          </div>

          <div className="postDetailCommentComposer">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment…"
              className="postDetailCommentInput"
            />
            <button onClick={handleAdd}>Post</button>
          </div>
        </div>

        {typeof onDelete === "function" ? (
          <div className="postDetailFooter">
            <button className="delete-button" onClick={onDelete}>
              Delete Post
            </button>
          </div>
        ) : null}
      </div>

      {selectedAverageSolve ? (
        typeof DetailComponent === "function" ? (
          <DetailComponent
            solve={selectedAverageSolve}
            onClose={() => setSelectedAverageSolve(null)}
            showActions={false}
          />
        ) : null
      ) : null}
    </div>
  );
}

export default PostDetail;
